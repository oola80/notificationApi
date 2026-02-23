> **Note:** This is a convenience copy. The authoritative version is at `../../docs/09-bulk-upload-service.md`.

---

# 09 — Bulk Upload Service

**Notification API — Bulk Upload Service Deep-Dive**

| | |
|---|---|
| **Version:** | 1.1 |
| **Date:** | 2026-02-21 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Architecture & Integration Points](#2-architecture--integration-points)
3. [File Upload & Validation](#3-file-upload--validation)
4. [Asynchronous Processing Pipeline](#4-asynchronous-processing-pipeline)
5. [Result File Generation](#5-result-file-generation)
6. [XLSX File Format (Flexible Mapping)](#6-xlsx-file-format-flexible-mapping)
7. [REST API Endpoints](#7-rest-api-endpoints)
8. [RabbitMQ Topology (Asynchronous Logging)](#8-rabbitmq-topology-asynchronous-logging)
9. [Database Design](#9-database-design)
10. [Upload Lifecycle State Machine](#10-upload-lifecycle-state-machine)
11. [Sequence Diagrams](#11-sequence-diagrams)
12. [Error Handling](#12-error-handling)
13. [Security Considerations](#13-security-considerations)
14. [Monitoring & Health Checks](#14-monitoring--health-checks)
15. [Configuration](#15-configuration)

---

## 1. Service Overview

The Bulk Upload Service enables the operative team to trigger bulk notifications by uploading XLSX spreadsheet files through the Admin UI. Each row in the spreadsheet is parsed into an event payload and submitted to the Event Ingestion Service via HTTP, preserving Event Ingestion as the single entry point for all events in the platform. The service processes files asynchronously — returning immediately after upload — and produces a downloadable result file that mirrors the original spreadsheet with an additional column indicating the submission outcome for each row.

| Attribute | Value |
|---|---|
| **Technology** | NestJS (TypeScript) with `exceljs` for XLSX parsing/writing |
| **Port** | `3158` |
| **Schema** | PostgreSQL — `bulk_upload_service` |
| **Dependencies** | Event Ingestion Service (HTTP), RabbitMQ (async logging), PostgreSQL |
| **Source Repo Folder** | `bulk-upload-service/` |
| **Source Identifier** | `bulk-upload` (used as `sourceId` field in event payloads) |

### Responsibilities

1. **File Upload & Validation:** Accept XLSX file uploads via multipart/form-data from the Admin UI (through the Gateway). Validate file format (`.xlsx` only), size (max 10 MB), row count (max 5,000 rows), and header row presence.
2. **Asynchronous Processing:** Parse XLSX rows in a background worker, construct v2.0 canonical events (flat top-level namespace) for each row **or group of rows**, and submit them to the Event Ingestion Service via HTTP (`POST /webhooks/events`). When columns with an `item.*` prefix are detected, the service automatically activates **group mode** — rows sharing the same group key (`eventType` + configurable column, default `orderId`) are consolidated into a single event with an `items[]` array. The upload endpoint returns `202 Accepted` immediately — processing happens entirely in the background.
3. **Result File Generation:** When processing completes, generate a result XLSX file that mirrors the original file with an additional `_notification_status` column. Each row indicates whether the event was successfully submitted to the Event Ingestion Service (`sent`) or not (`failed: <reason>`). The result file is stored and available for download.
4. **Progress Tracking:** Track upload progress and per-row processing status in PostgreSQL. Provide REST endpoints for checking processing status and retrieving results.
5. **Retry Support:** Allow retry of failed rows for uploads in `partial` or `failed` status. Retried rows are resubmitted to Event Ingestion and the result file is regenerated.
6. **Asynchronous Audit Logging:** All audit-relevant events (upload created, processing started, row outcomes, processing completed) are published to RabbitMQ as fire-and-forget messages. No synchronous database writes for logging — the Audit Service consumes and persists these messages independently.

> **Info:** **Three Core Endpoints**
>
> The service exposes three primary endpoints that form the upload lifecycle: (1) `POST /uploads` to upload a file and start async processing, (2) `GET /uploads/:id/status` to poll processing progress, and (3) `GET /uploads/:id/result` to download the result file once processing completes. All other endpoints (list, errors, retry, cancel) support operational management of uploads.

---

## 2. Architecture & Integration Points

The Bulk Upload Service sits between the Admin UI (via the Gateway) and the Event Ingestion Service. It acts as a file-to-event adapter — accepting structured spreadsheet data, transforming each row into a canonical event payload, and submitting it to the event pipeline. All audit logging is decoupled via RabbitMQ fire-and-forget messages, ensuring the processing pipeline is never blocked by downstream log persistence.

### Upstream & Downstream Dependencies

| Direction | System | Protocol | Description |
|---|---|---|---|
| **Upstream** | Admin UI (via Gateway) | HTTP/REST | File uploads, status queries, result downloads proxied through Notification Gateway |
| **Downstream** | Event Ingestion Service | HTTP/REST (sync per row) | Submits each parsed row as an event via `POST /webhooks/events` |
| **Downstream** | Audit Service | RabbitMQ (AMQP) | Publishes upload lifecycle events (fire-and-forget) to `xch.notifications.status` exchange |

### Figure 2.1 — Integration Context

```
┌─────────────────────────┐
│     Admin UI :3159       │
│     /bulk-upload page    │
└────────────┬────────────┘
             │ HTTP (file upload, status poll, result download)
             ▼
┌─────────────────────────┐
│  Notification Gateway   │
│  :3150 (BFF)            │
│  Auth · Rate Limit      │
└────────────┬────────────┘
             │ HTTP proxy
             ▼
┌─────────────────────────────────────────────────────────────┐
│                  Bulk Upload Service :3158                    │
│                                                              │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │  Upload    │  │  Background  │  │  Result File         │ │
│  │  Endpoint  │  │  Worker      │  │  Generator           │ │
│  │  (REST)    │→│  (Async)     │→│  (XLSX + status col) │ │
│  └────────────┘  └──────┬───────┘  └──────────────────────┘ │
│                         │                                    │
│  PostgreSQL: bulk_upload_service                             │
└─────────────────────────┼────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
┌──────────────────────┐  ┌─────────────────────────────┐
│  Event Ingestion     │  │  xch.notifications.status   │
│  Service :3151       │  │  (RabbitMQ Exchange)        │
│                      │  │                             │
│  POST /webhooks/     │  │  Fire-and-forget audit      │
│  events              │  │  messages                   │
└──────────────────────┘  └──────────────┬──────────────┘
                                         │
                                         ▼
                            ┌─────────────────────────┐
                            │  Audit Service :3156     │
                            │  Consumes & persists     │
                            └─────────────────────────┘
```

### Communication Patterns

| Pattern | Usage | Justification |
|---|---|---|
| **Synchronous HTTP** | Row submission to Event Ingestion (`POST /webhooks/events`) | The service needs the response (event ID or error) to track per-row outcome and build the result file |
| **Asynchronous RabbitMQ** | Audit logging (upload lifecycle events, row outcomes) | Logging must never block the processing pipeline; fire-and-forget ensures zero overhead on the critical path |
| **Synchronous HTTP** | Status queries and result downloads (from Gateway) | The caller (Admin UI) needs immediate responses for progress polling and file downloads |

> **Info:** **Why HTTP to Event Ingestion Instead of Direct RabbitMQ?**
>
> The Bulk Upload Service submits events via HTTP to the Event Ingestion Service rather than publishing directly to RabbitMQ. This preserves Event Ingestion as the single entry point for all events — ensuring consistent validation, normalization, mapping resolution, and source tracking regardless of origin. The HTTP approach also provides immediate per-row feedback (accepted/rejected) needed for the result file. See [07 — Event Ingestion Service §2](07-event-ingestion-service.md#2-architecture--integration-points) for the full integration context.

---

## 3. File Upload & Validation

When a user uploads an XLSX file, the service performs a series of synchronous validations before accepting the file. If any validation fails, the request is rejected immediately with a descriptive error — no upload record is created.

### 3.1 Validation Pipeline

```
    ┌─────────────────────────┐
    │  Receive multipart POST  │  ◄── POST /uploads (multipart/form-data)
    └────────────┬────────────┘
                 ▼
     ◆ File extension = .xlsx? ◆────── No ──▶ [400: Invalid file format]
                 │
                Yes
                 ▼
     ◆ MIME type valid?        ◆────── No ──▶ [400: Invalid MIME type]
                 │               (application/vnd.openxmlformats-
                Yes               officedocument.spreadsheetml.sheet)
                 ▼
     ◆ File size ≤ 10 MB?     ◆────── No ──▶ [400: File too large]
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  Parse header row        │
    └────────────┬────────────┘
                 ▼
     ◆ Header row present?     ◆────── No ──▶ [400: Missing header row]
                 │
                Yes
                 ▼
     ◆ 'eventType' column?    ◆────── No ──▶ [400: Missing required 'eventType' column]
                 │
                Yes
                 ▼
     ◆ 'item.*' columns?     ◆────── Yes ──▶ ◆ Group key column   ◆── No ──▶ [400: Group mode
                 │                              │  present? (default  │          detected but
                No                             Yes  'orderId')        │          missing group
                 │                              │                     │          key column]
                 │◄─────────────────────────────┘
                 ▼
     ◆ Data rows ≤ 5,000?     ◆────── No ──▶ [400: Exceeds row limit]
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  Store file to temp dir  │
    │  Create upload record    │
    │  (status: queued)        │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  Return 202 Accepted     │  ──▶ { uploadId, fileName, totalRows, status: "queued" }
    │  Enqueue background job  │
    └─────────────────────────┘
```

### 3.2 Validation Rules

| Validation | Criteria | Error Response |
|---|---|---|
| **File format** | Extension must be `.xlsx` | `400 Bad Request` — `"Only .xlsx files are accepted"` |
| **MIME type** | Must be `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `400 Bad Request` — `"Invalid MIME type"` |
| **File size** | Maximum 10 MB | `400 Bad Request` — `"File size exceeds 10 MB limit"` |
| **Header row** | First row must contain column headers | `400 Bad Request` — `"Missing header row"` |
| **Required column** | `eventType` column must be present in header | `400 Bad Request` — `"Missing required 'eventType' column"` |
| **Row count** | Maximum 5,000 data rows (excluding header) | `400 Bad Request` — `"File exceeds 5,000 row limit (found {n} rows)"` |
| **Minimum rows** | At least 1 data row | `400 Bad Request` — `"File contains no data rows"` |
| **Group key column** | If `item.*` columns are detected (group mode), the group key column (default `orderId`) must be present in the header | `400 Bad Request` — `"Group mode detected (item.* columns found) but required group key column 'orderId' is missing"` |
| **Empty group key value** | In group mode, each row must have a non-empty value in the group key column | Row marked as `skipped` — `"Missing group key value in 'orderId' column"` |
| **Empty item row** | In group mode, rows where all `item.*` cells are empty are skipped | Row marked as `skipped` — `"All item fields empty"` |

### 3.3 File Storage

Uploaded XLSX files are stored temporarily in a configurable directory (`UPLOAD_TEMP_DIR`, default: `./uploads/temp`). Files are retained until the result file is generated, after which the original is no longer needed. A scheduled cleanup removes orphaned temp files older than 24 hours.

| File Type | Location | Retention |
|---|---|---|
| Uploaded XLSX (original) | `{UPLOAD_TEMP_DIR}/{uploadId}/original.xlsx` | Until result file generated |
| Result XLSX | `{UPLOAD_RESULT_DIR}/{uploadId}/result.xlsx` | Configurable (default: 30 days) |

---

## 4. Asynchronous Processing Pipeline

After the upload endpoint returns `202 Accepted`, a background worker picks up the job and processes rows asynchronously. The worker uses a configurable concurrency level to submit events to the Event Ingestion Service in parallel, with rate limiting to prevent overwhelming downstream services.

### 4.1 Processing Steps

1. **Dequeue Job:** Background worker picks up the next `queued` upload from the database (FIFO ordering by `created_at`). Sets upload status to `processing` and records `started_at`.
2. **Parse XLSX:** Open the stored XLSX file using `exceljs` streaming reader. Extract the header row to determine column mapping.
3. **Bulk Insert Rows:** Insert all data rows into the `upload_rows` table with status `pending` in a single batch INSERT. In group mode, the composite `group_key` (`{eventType}:{groupKeyValue}`) is computed and stored for each row during this step. This provides the baseline for progress tracking.
4. **Process Rows:** Iterate through rows in configurable batch sizes (default: 50). For each batch, submit rows to Event Ingestion Service in parallel (configurable concurrency, default: 5 concurrent requests).
5. **Per-Row or Per-Group Submission:**
   - **Standard mode (no `item.*` columns):** For each row, construct the event payload (see [Section 6 — XLSX File Format](#6-xlsx-file-format-flexible-mapping)), send `POST /webhooks/events` to Event Ingestion Service, and record the outcome.
   - **Group mode (`item.*` columns detected):** For each unique `group_key`, collect all rows in the group, take order-level field values from the first row, build the `items[]` array from all `item.*` columns across rows (stripping the `item.` prefix), construct a single event payload (see [Section 6.4 — Group Mode](#64-group-mode-multi-item-events)), and submit one event. All rows in the group are updated with the same outcome and `event_id`.
   - Outcomes per submission:
     - **Success (202 Accepted):** Mark row(s) as `succeeded`, store returned `event_id`.
     - **Duplicate (200 OK):** Mark row(s) as `succeeded`, store existing `event_id`.
     - **Validation Error (400/422):** Mark row(s) as `failed`, store error message.
     - **Server Error (500/timeout):** Mark row(s) as `failed`, store error details.
6. **Update Progress:** After each batch, update the `uploads` aggregate counters (`processed_rows`, `succeeded_rows`, `failed_rows`) atomically. Publish progress event to RabbitMQ (fire-and-forget).
7. **Finalize:** When all rows are processed, determine the final upload status (`completed`, `partial`, or `failed`), record `completed_at`, populate `total_events` (equal to `total_rows` in standard mode, or the unique group count in group mode), and trigger result file generation.
8. **Generate Result File:** Build the result XLSX from the original file with the additional `_notification_status` column (see [Section 5](#5-result-file-generation)).
9. **Publish Completion Event:** Publish a fire-and-forget completion event to RabbitMQ for the Audit Service.

### Figure 4.1 — Asynchronous Processing Pipeline

```
    ┌──────────────────────────┐
    │  1. Dequeue Job           │  ◄── Pick up queued upload (FIFO)
    │     status → processing   │
    └────────────┬─────────────┘
                 ▼
    ┌──────────────────────────┐
    │  2. Parse XLSX            │  ◄── exceljs streaming reader
    │     Extract headers       │
    └────────────┬─────────────┘
                 ▼
    ┌──────────────────────────┐
    │  3. Bulk Insert Rows      │  ◄── INSERT all rows as 'pending'
    │     to upload_rows        │      (with group_key if group mode)
    └────────────┬─────────────┘
                 ▼
     ◆ Group mode active?      ◆
     │  (item.* cols detected)  │
     └──────┬──────────┬────────┘
           Yes          No
            │            │
            ▼            ▼
    ┌──────────────┐  ┌──────────────────┐
    │  Group rows   │  │  Process rows    │
    │  by group_key │  │  individually    │
    └──────┬───────┘  │  (standard mode) │
           │          └────────┬─────────┘
           └────────┬──────────┘
                    ▼
    ┌──────────────────────────┐
    │  4. Process Batches       │  ◄── Batch size: 50, concurrency: 5
    └────────────┬─────────────┘
                 │
                 ▼
    ┌──────────────────────────────────────────────────────────┐
    │  5. For each row (or group) in batch:                     │
    │     ┌────────────────────────────────────────────────┐   │
    │     │  Construct event payload:                       │   │
    │     │  { sourceId: "bulk-upload",                     │   │
    │     │    cycleId: row.cycleId ?? uploadId,            │   │
    │     │    eventType: row.eventType,                    │   │
    │     │    payload: { ...dynamicColumns } }             │   │
    │     └────────────────┬───────────────────────────────┘   │
    │                      ▼                                    │
    │     ┌────────────────────────────────────────────────┐   │
    │     │  POST /webhooks/events                          │   │
    │     │  → Event Ingestion Service :3151                │   │
    │     └────────────────┬───────────────────────────────┘   │
    │                      ▼                                    │
    │          ┌───────────┴───────────┐                        │
    │          │   Response?           │                        │
    │          └──┬──────┬──────┬──────┘                        │
    │            202    200   4xx/5xx                            │
    │             │      │      │                               │
    │             ▼      ▼      ▼                               │
    │          Success  Dup   Failed                             │
    │          (sent)  (sent) (failed: reason)                   │
    │                                                           │
    │     Update upload_rows status + event_id or error_message │
    └──────────────────────────┬───────────────────────────────┘
                 │
                 ▼
    ┌──────────────────────────┐
    │  6. Update Progress       │  ◄── Atomic counter update
    │     Publish progress      │      Fire-and-forget to RabbitMQ
    │     (fire-and-forget)     │
    └────────────┬─────────────┘
                 ▼
     ◆ All rows processed?     ◆────── No ──▶ [Next batch → step 4]
                 │
                Yes
                 ▼
    ┌──────────────────────────┐
    │  7. Finalize Upload       │  ◄── Determine final status
    │     completed / partial   │      Record completed_at
    │     / failed              │
    └────────────┬─────────────┘
                 ▼
    ┌──────────────────────────┐
    │  8. Generate Result File  │  ◄── Original XLSX + _notification_status
    └────────────┬─────────────┘
                 ▼
    ┌──────────────────────────┐
    │  9. Publish Completion    │  ◄── Fire-and-forget to RabbitMQ
    │     Event (async)         │
    └──────────────────────────┘
```

### 4.2 Concurrency & Rate Limiting

Row submissions to the Event Ingestion Service are controlled by two mechanisms:

| Parameter | Default | Description |
|---|---|---|
| `WORKER_BATCH_SIZE` | `50` | Number of rows loaded from the database per iteration |
| `WORKER_CONCURRENCY` | `5` | Maximum parallel HTTP requests to Event Ingestion Service |
| `WORKER_RATE_LIMIT` | `50` | Maximum events submitted per second (token bucket) |
| `WORKER_REQUEST_TIMEOUT_MS` | `10000` | HTTP request timeout per row submission |

The rate limit (`WORKER_RATE_LIMIT`) uses a token bucket algorithm to ensure the Bulk Upload Service does not overwhelm the Event Ingestion Service during large uploads. With the default of 50 events/second, a 5,000-row file completes in approximately 100 seconds.

### 4.3 Worker Lifecycle

The background worker runs as an in-process NestJS service (not a separate process). It uses a polling loop with configurable interval (`WORKER_POLL_INTERVAL_MS`, default: 2000ms) to check for queued uploads. Only one upload is processed at a time per worker instance — concurrent uploads are handled by horizontal scaling (multiple service instances).

```
Worker Start
     │
     ▼
┌────────────────────┐
│  Poll for queued   │◄──────────────────────────────┐
│  uploads (FIFO)    │                                │
└────────┬───────────┘                                │
         │                                            │
    ┌────┴────┐                                       │
    │ Found?  │                                       │
    └──┬───┬──┘                                       │
      Yes   No                                        │
       │    │                                         │
       │    └── Sleep(WORKER_POLL_INTERVAL_MS) ───────┘
       │
       ▼
┌────────────────────┐
│  Process upload     │
│  (steps 1-9)       │
└────────┬───────────┘
         │
         └────────────────────────────────────────────┘
```

> **Warning:** **Single-Worker-Per-Upload Guarantee**
>
> To prevent duplicate processing, the worker claims an upload using an atomic `UPDATE ... SET status = 'processing' WHERE status = 'queued' RETURNING *` query. The `WHERE status = 'queued'` predicate combined with PostgreSQL's row-level locking ensures that only one worker instance processes each upload, even when multiple service instances are running.

---

## 5. Result File Generation

When processing completes (regardless of whether the outcome is `completed`, `partial`, or `failed`), the service generates a result XLSX file. This file mirrors the original uploaded spreadsheet exactly — same columns, same rows, same data — with one additional column appended: `_notification_status`.

### 5.1 Result File Structure

The `_notification_status` column is appended as the last column in the result file. Its value for each row indicates the outcome of submitting that row to the Event Ingestion Service:

| Status Value | Meaning |
|---|---|
| `sent` | Event was accepted by Event Ingestion Service (HTTP 202 or 200). The corresponding `event_id` is stored in the database for traceability. |
| `failed: <reason>` | Event submission failed. The `<reason>` contains the error message (e.g., `failed: 422 — No mapping configuration found for source 'bulk-upload' and event type 'order.unknown'`). |
| `skipped` | Row was skipped during processing (e.g., missing `eventType` value, empty row). |

> **Info:** **Grouped Rows Share Status**
>
> In group mode, all rows belonging to the same group (same `group_key`) receive the same `_notification_status` value — they map to a single event. If the event succeeds, all rows show `sent`. If it fails, all rows show the same `failed: <reason>` message.

### 5.2 Result File Example

**Original Uploaded File:**

| eventType | cycleId | customerEmail | customerName | orderId | totalAmount |
|---|---|---|---|---|---|
| order.shipped | CYC-001 | jane@example.com | Jane Doe | ORD-001 | 79.99 |
| order.created | CYC-002 | john@example.com | John Smith | ORD-002 | 149.50 |
| order.unknown | CYC-003 | bob@example.com | Bob Jones | ORD-003 | 25.00 |
| | CYC-004 | alice@example.com | Alice | ORD-004 | 50.00 |

**Generated Result File:**

| eventType | cycleId | customerEmail | customerName | orderId | totalAmount | _notification_status |
|---|---|---|---|---|---|---|
| order.shipped | CYC-001 | jane@example.com | Jane Doe | ORD-001 | 79.99 | sent |
| order.created | CYC-002 | john@example.com | John Smith | ORD-002 | 149.50 | sent |
| order.unknown | CYC-003 | bob@example.com | Bob Jones | ORD-003 | 25.00 | failed: 422 — No mapping configuration found for source 'bulk-upload' and event type 'order.unknown' |
| | CYC-004 | alice@example.com | Alice | ORD-004 | 50.00 | skipped: Missing required 'eventType' value |

**Group Mode Result File Example:**

**Original Uploaded File (with `item.*` columns):**

| eventType | cycleId | orderId | customerEmail | totalAmount | item.sku | item.name | item.qty | _notification_status |
|---|---|---|---|---|---|---|---|---|
| order.shipped | CYC-001 | ORD-001 | jane@example.com | 99.97 | PROD-001 | Headphones | 1 | sent |
| order.shipped | CYC-001 | ORD-001 | jane@example.com | 99.97 | PROD-002 | USB Cable | 2 | sent |
| order.created | CYC-002 | ORD-002 | john@example.com | 25.00 | PROD-003 | Phone Case | 1 | sent |

> **Info:** Rows 1 and 2 share group key `order.shipped:ORD-001` and were submitted as a single event — both rows show the same `sent` status. Row 3 is a separate group (`order.created:ORD-002`).

### 5.3 Result File Generation Flow

```
    ┌───────────────────────────────┐
    │  Processing Complete           │
    │  (all rows have outcomes)      │
    └────────────┬──────────────────┘
                 ▼
    ┌───────────────────────────────┐
    │  1. Open original XLSX file   │  ◄── From temp storage
    │     using exceljs             │
    └────────────┬──────────────────┘
                 ▼
    ┌───────────────────────────────┐
    │  2. Add '_notification_status'│  ◄── Append as last header column
    │     column header             │
    └────────────┬──────────────────┘
                 ▼
    ┌───────────────────────────────┐
    │  3. Query upload_rows         │  ◄── SELECT row_number, status,
    │     for all row outcomes      │      event_id, error_message
    └────────────┬──────────────────┘      ORDER BY row_number
                 ▼
    ┌───────────────────────────────┐
    │  4. For each data row:        │
    │     - succeeded → "sent"      │
    │     - failed → "failed: msg"  │
    │     - skipped → "skipped: msg"│
    │     Write value to status col │
    └────────────┬──────────────────┘
                 ▼
    ┌───────────────────────────────┐
    │  5. Style status column:      │
    │     - sent → green fill       │
    │     - failed → red fill       │
    │     - skipped → yellow fill   │
    └────────────┬──────────────────┘
                 ▼
    ┌───────────────────────────────┐
    │  6. Save result XLSX to       │  ◄── {UPLOAD_RESULT_DIR}/{uploadId}/
    │     result storage dir        │      result.xlsx
    └────────────┬──────────────────┘
                 ▼
    ┌───────────────────────────────┐
    │  7. Update upload record:     │
    │     result_file_path = path   │
    │     result_generated_at = now │
    └───────────────────────────────┘
```

### 5.4 Result File Styling

The result XLSX file applies conditional formatting to the `_notification_status` column for visual clarity:

| Status | Cell Fill Color | Font Color |
|---|---|---|
| `sent` | Light green (`#E6F4EA`) | Dark green (`#137333`) |
| `failed: ...` | Light red (`#FCE8E6`) | Dark red (`#C5221F`) |
| `skipped: ...` | Light yellow (`#FEF7E0`) | Dark yellow (`#B05A00`) |

> **Info:** **Result File Availability**
>
> The result file is available for download via `GET /uploads/:id/result` only after processing completes (upload status is `completed`, `partial`, or `failed`). Requesting the result before processing finishes returns `409 Conflict` with a message indicating that processing is still in progress. Result files are retained for a configurable period (`RESULT_RETENTION_DAYS`, default: 30 days) and cleaned up by a scheduled task.

---

## 6. XLSX File Format (Flexible Mapping)

The Bulk Upload Service uses a **fully flexible column-mapping** approach — there is no predefined schema for the XLSX file beyond requiring an `eventType` column. This allows any event type to be submitted without requiring code changes or schema updates.

### 6.1 Mapping Rules

| Rule | Description |
|---|---|
| **Header Row** | The first row must be the header row (column names) |
| **`eventType` Column** | Required — determines the event type for each row |
| **`cycleId` Column** | Optional — if present, used as the business cycle identifier. If absent, the `uploadId` is used as the `cycleId` for all rows. |
| **Dynamic Columns** | All other column headers become top-level fields in the v2.0 canonical event payload |
| **Empty Cells** | Omitted from the event payload (not included as null) |
| **JSON Values** | Columns with JSON-parseable values (e.g., `[{"sku":"X"}]`) are parsed as JSON; otherwise treated as strings/numbers |
| **Numeric Values** | Values that parse as numbers are stored as numbers, not strings |
| **Reserved Columns** | Columns starting with `_` are reserved for system use and excluded from the event payload |
| **`item.*` Prefix** | Columns with an `item.` prefix activate **group mode**. Values from these columns are collected into an `items[]` array in the event payload, with the prefix stripped from field names (e.g., `item.sku` → `sku`). See [Section 6.4](#64-group-mode-multi-item-events). |
| **Group Key Column** | In group mode, the group key column (configurable via `GROUP_KEY_COLUMN`, default `orderId`) combined with `eventType` forms the composite group key. Rows sharing the same group key are consolidated into a single event. |

### 6.2 Event Payload Construction

For each data row, the service constructs the following event payload:

```json
{
  "sourceId": "bulk-upload",
  "cycleId": "<row.cycleId or uploadId>",
  "eventType": "<row.eventType>",
  "sourceEventId": "<uploadId>-row-<rowNumber>",
  "timestamp": "<ISO-8601 current time>",
  "payload": {
    "<column1>": "<value1>",
    "<column2>": "<value2>"
  }
}
```

| Field | Source | Description |
|---|---|---|
| `sourceId` | Hardcoded | Always `"bulk-upload"` — identifies this service as the event source |
| `cycleId` | Row or uploadId | From `cycleId` column if present; otherwise the `uploadId` is used |
| `eventType` | Row | Value from the `eventType` column |
| `sourceEventId` | Generated | `{uploadId}-row-{rowNumber}` — enables deduplication in Event Ingestion |
| `timestamp` | Generated | Current ISO-8601 UTC timestamp at submission time |
| `payload` | Row | All remaining columns (excluding `eventType`, `cycleId`, and `_`-prefixed columns) mapped as top-level payload fields |

#### Group Mode Payload Construction

In group mode, the event payload is constructed differently:

```json
{
  "sourceId": "bulk-upload",
  "cycleId": "<firstRow.cycleId or uploadId>",
  "eventType": "<firstRow.eventType>",
  "sourceEventId": "<uploadId>-group-<eventType>-<groupKeyValue>",
  "timestamp": "<ISO-8601 current time>",
  "payload": {
    "<orderLevelColumn1>": "<firstRow.value1>",
    "<orderLevelColumn2>": "<firstRow.value2>",
    "<GROUP_ITEMS_TARGET_FIELD>": [
      { "<itemField1>": "<row1.value>", "<itemField2>": "<row1.value>" },
      { "<itemField1>": "<row2.value>", "<itemField2>": "<row2.value>" }
    ]
  }
}
```

| Field | Source | Description |
|---|---|---|
| `sourceId` | Hardcoded | Always `"bulk-upload"` |
| `cycleId` | First row in group | From `cycleId` column of the first row; otherwise the `uploadId` |
| `eventType` | First row in group | Value from the `eventType` column (same for all rows in group) |
| `sourceEventId` | Generated | `{uploadId}-group-{eventType}-{groupKeyValue}` — enables deduplication |
| `timestamp` | Generated | Current ISO-8601 UTC timestamp at submission time |
| `payload` (order-level) | First row in group | All non-`item.*`, non-reserved columns from the first row in the group |
| `payload.items` | All rows in group | Array of objects built from `item.*` columns across all rows (prefix stripped) |

### 6.3 Example XLSX and Resulting Payloads

**XLSX File:**

| eventType | cycleId | customerEmail | customerName | orderId | totalAmount | items |
|---|---|---|---|---|---|---|
| order.shipped | CYC-001 | jane@example.com | Jane Doe | ORD-001 | 79.99 | [{"sku":"P1","qty":1}] |

**Constructed Event Payload:**

```json
{
  "sourceId": "bulk-upload",
  "cycleId": "CYC-001",
  "eventType": "order.shipped",
  "sourceEventId": "a1b2c3d4-row-2",
  "timestamp": "2026-02-20T14:30:00.000Z",
  "payload": {
    "customerEmail": "jane@example.com",
    "customerName": "Jane Doe",
    "orderId": "ORD-001",
    "totalAmount": 79.99,
    "items": [{"sku": "P1", "qty": 1}]
  }
}
```

> **Info:** **Source Registration Prerequisite**
>
> The source `bulk-upload` must be registered in the Event Ingestion Service's `event_sources` table, and appropriate mapping configurations must exist in `event_mappings` for each event type used in the XLSX file. Without valid mappings, Event Ingestion will reject rows with `422 Unprocessable Entity`. See [07 — Event Ingestion Service §3.3](07-event-ingestion-service.md#33-example--onboarding-a-new-source) for source onboarding details.

> **Info:** **Media Support in XLSX Files**
>
> XLSX files can include a `media` column containing a JSON array of media references matching the canonical `media` schema (see [07 — Event Ingestion Service §7](07-event-ingestion-service.md#media-reference-schema)). Since JSON values in cells are automatically parsed (see Rule: JSON Values above), the `media` column value is included as a structured array in the event payload, e.g., `[{"type":"image","url":"https://cdn.example.com/img.jpg","context":"inline"}]`. The Event Ingestion Service's runtime mapping configuration handles mapping this field into the canonical event. Media URLs must be externally hosted — the Bulk Upload Service does not accept binary file uploads for media.

### 6.4 Group Mode: Multi-Item Events

Group mode is automatically activated when the XLSX file contains one or more columns with the `item.` prefix (configurable via `GROUP_ITEMS_PREFIX`). No explicit flag or parameter is needed — the service auto-detects the prefix during header parsing. If no `item.*` columns are present, the service operates in standard mode (one row = one event) with no behavioral change.

#### Detection

During header row parsing (step 2 of the validation pipeline), the service scans all column names for the configured prefix (default `item.`). If at least one matching column is found:

1. **Group mode activates** — the group key column (default `orderId`, configurable via `GROUP_KEY_COLUMN`) must also be present in the header, or the upload is rejected with `400 Bad Request`.
2. All columns are classified as either **order-level** (no `item.` prefix) or **item-level** (`item.` prefix).

#### Column Convention

| Column Type | Naming | Example | Role in Event |
|---|---|---|---|
| **Order-level** | No prefix (standard column names) | `orderId`, `customerEmail`, `totalAmount` | Top-level fields in `payload` — values taken from the **first row** in the group |
| **Item-level** | `item.` prefix | `item.sku`, `item.name`, `item.qty`, `item.price` | Collected into `items[]` array — prefix stripped (e.g., `item.sku` → `sku`) |
| **Reserved** | `_` prefix | `_notification_status` | Excluded from event payload (system use) |
| **Control** | `eventType`, `cycleId` | `eventType`, `cycleId` | Envelope fields — not included in `payload` |

#### End-to-End Example

**Input XLSX (3 rows, 2 groups):**

| eventType | cycleId | orderId | customerEmail | customerName | totalAmount | item.sku | item.name | item.qty | item.price |
|---|---|---|---|---|---|---|---|---|---|
| order.shipped | CYC-001 | ORD-001 | jane@example.com | Jane Doe | 99.97 | PROD-001 | Headphones | 1 | 79.99 |
| order.shipped | CYC-001 | ORD-001 | jane@example.com | Jane Doe | 99.97 | PROD-002 | USB Cable | 2 | 9.99 |
| order.created | CYC-002 | ORD-002 | john@example.com | John Smith | 25.00 | PROD-003 | Phone Case | 1 | 25.00 |

**Groups Detected:**

- **Group 1:** `order.shipped:ORD-001` → rows 2–3 (2 items)
- **Group 2:** `order.created:ORD-002` → row 4 (1 item)

**Event 1 (Group 1):**

```json
{
  "sourceId": "bulk-upload",
  "cycleId": "CYC-001",
  "eventType": "order.shipped",
  "sourceEventId": "a1b2c3d4-group-order.shipped-ORD-001",
  "timestamp": "2026-02-21T10:00:00.000Z",
  "payload": {
    "orderId": "ORD-001",
    "customerEmail": "jane@example.com",
    "customerName": "Jane Doe",
    "totalAmount": 99.97,
    "items": [
      { "sku": "PROD-001", "name": "Headphones", "qty": 1, "price": 79.99 },
      { "sku": "PROD-002", "name": "USB Cable", "qty": 2, "price": 9.99 }
    ]
  }
}
```

**Event 2 (Group 2):**

```json
{
  "sourceId": "bulk-upload",
  "cycleId": "CYC-002",
  "eventType": "order.created",
  "sourceEventId": "a1b2c3d4-group-order.created-ORD-002",
  "timestamp": "2026-02-21T10:00:00.000Z",
  "payload": {
    "orderId": "ORD-002",
    "customerEmail": "john@example.com",
    "customerName": "John Smith",
    "totalAmount": 25.00,
    "items": [
      { "sku": "PROD-003", "name": "Phone Case", "qty": 1, "price": 25.00 }
    ]
  }
}
```

#### Inconsistency Handling

If order-level column values differ across rows in the same group (e.g., different `customerEmail` for the same `orderId`), the behavior depends on the `GROUP_CONFLICT_MODE` setting:

| Mode | Behavior | Use Case |
|---|---|---|
| `warn` (default) | Use values from the **first row** in the group. Log a structured warning with the conflicting field name, group key, and row numbers. | Tolerant processing — minor data entry inconsistencies are acceptable |
| `strict` | Mark the entire group as `failed` with error message: `"Inconsistent order-level data for group key '{groupKey}': {fieldName} differs across rows {rowNumbers}"`. All rows in the group receive the same `failed` status. | Data integrity enforcement — no tolerance for inconsistencies |

#### Row Count Impact

With grouping, the 5,000 row limit applies to **Excel rows**, not events. A file with 1,000 orders averaging 3 items each = 3,000 Excel rows but only 1,000 events submitted to Event Ingestion. This is more efficient in terms of downstream load but uses more Excel row capacity per event.

#### Retry Behavior

Retry operates at the **group level**. If a group failed, all rows in that group are reset to `pending` and retried together as one event. Already-succeeded groups are not reprocessed.

---

## 7. REST API Endpoints

All endpoints are exposed on port `3158` and accessed through the Notification Gateway (port `3150`) which handles authentication and RBAC enforcement.

### POST /uploads

Upload an XLSX file for bulk event submission. Validates the file synchronously, creates an upload record, and enqueues the file for asynchronous background processing.

#### Request

| Attribute | Value |
|---|---|
| **Method** | `POST` |
| **Path** | `/uploads` |
| **Content-Type** | `multipart/form-data` |
| **RBAC** | Admin, Operator |

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File | Yes | XLSX file (max 10 MB, max 5,000 rows) |

#### Responses

| Status | Description | Body |
|---|---|---|
| `202 Accepted` | File accepted, processing enqueued | `{ "uploadId": "uuid", "fileName": "orders.xlsx", "totalRows": 150, "status": "queued" }` |
| `400 Bad Request` | Validation failed | `{ "error": "...", "details": "..." }` |
| `401 Unauthorized` | Missing or invalid JWT token | `{ "error": "Authentication required" }` |
| `403 Forbidden` | Insufficient role (requires Admin or Operator) | `{ "error": "Insufficient permissions" }` |
| `413 Payload Too Large` | File exceeds 10 MB limit | `{ "error": "File size exceeds 10 MB limit" }` |
| `429 Too Many Requests` | Upload rate limit exceeded | `{ "error": "Too many uploads", "retryAfter": 60 }` |

---

### GET /uploads/:id/status

Check the processing status of a specific upload. Designed for polling by the Admin UI to show real-time progress.

#### Request

| Attribute | Value |
|---|---|
| **Method** | `GET` |
| **Path** | `/uploads/:id/status` |
| **RBAC** | Admin, Operator, Viewer |

#### Response (200 OK)

```json
{
  "uploadId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "fileName": "february-orders.xlsx",
  "status": "processing",
  "totalRows": 500,
  "totalEvents": 200,
  "processedRows": 342,
  "succeededRows": 330,
  "failedRows": 12,
  "progressPercent": 68.4,
  "startedAt": "2026-02-20T14:30:05.000Z",
  "completedAt": null,
  "resultFileReady": false,
  "estimatedTimeRemainingMs": 31600
}
```

| Field | Type | Description |
|---|---|---|
| `uploadId` | UUID | Upload identifier |
| `fileName` | string | Original file name |
| `status` | string | Current upload status (see [Section 10](#10-upload-lifecycle-state-machine)) |
| `totalRows` | integer | Total data rows in the file (Excel rows excluding header) |
| `totalEvents` | integer | Total events to submit — equals `totalRows` in standard mode, or the number of unique groups in group mode. `null` until processing begins. |
| `processedRows` | integer | Rows processed so far |
| `succeededRows` | integer | Rows successfully submitted |
| `failedRows` | integer | Rows that failed submission |
| `progressPercent` | number | Processing progress as a percentage. In group mode, based on events processed / `totalEvents`. |
| `startedAt` | ISO-8601 | When processing began (null if `queued`) |
| `completedAt` | ISO-8601 | When processing finished (null if not complete) |
| `resultFileReady` | boolean | Whether the result XLSX is available for download |
| `estimatedTimeRemainingMs` | integer | Estimated remaining time in milliseconds (null if not processing) |

---

### GET /uploads/:id/result

Download the result XLSX file. The result file contains all original columns plus the `_notification_status` column indicating the submission outcome for each row.

#### Request

| Attribute | Value |
|---|---|
| **Method** | `GET` |
| **Path** | `/uploads/:id/result` |
| **RBAC** | Admin, Operator, Viewer |

#### Responses

| Status | Description | Headers |
|---|---|---|
| `200 OK` | Result file download | `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="result-{uploadId}.xlsx"` |
| `404 Not Found` | Upload not found | — |
| `409 Conflict` | Processing not yet complete | `{ "error": "Upload is still processing", "status": "processing", "progressPercent": 68.4 }` |
| `410 Gone` | Result file expired (past retention period) | `{ "error": "Result file has been purged" }` |

---

### GET /uploads

List all uploads with pagination and filters.

#### Request

| Attribute | Value |
|---|---|
| **Method** | `GET` |
| **Path** | `/uploads` |
| **RBAC** | Admin, Operator, Viewer |

#### Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `status` | string | — | Filter by upload status |
| `uploadedBy` | UUID | — | Filter by uploading user ID |
| `dateFrom` | ISO-8601 | — | Start of date range |
| `dateTo` | ISO-8601 | — | End of date range |
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page (max 100) |

#### Response (200 OK)

```json
{
  "data": [
    {
      "uploadId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "fileName": "february-orders.xlsx",
      "fileSize": 245760,
      "totalRows": 500,
      "succeededRows": 488,
      "failedRows": 12,
      "status": "partial",
      "uploadedBy": "user-uuid",
      "resultFileReady": true,
      "createdAt": "2026-02-20T14:30:00.000Z",
      "completedAt": "2026-02-20T14:31:40.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 47,
    "totalPages": 3
  }
}
```

---

### GET /uploads/:id

Get detailed information for a specific upload including file metadata, progress counters, and timing.

#### Response (200 OK)

```json
{
  "uploadId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "fileName": "february-orders.xlsx",
  "fileSize": 245760,
  "totalRows": 500,
  "processedRows": 500,
  "succeededRows": 488,
  "failedRows": 12,
  "status": "partial",
  "uploadedBy": "user-uuid",
  "startedAt": "2026-02-20T14:30:05.000Z",
  "completedAt": "2026-02-20T14:31:40.000Z",
  "resultFileReady": true,
  "resultFilePath": "/uploads/results/a1b2c3d4/result.xlsx",
  "createdAt": "2026-02-20T14:30:00.000Z",
  "updatedAt": "2026-02-20T14:31:40.000Z"
}
```

---

### GET /uploads/:id/errors

Get failed row details for a specific upload. Returns a paginated list of rows that failed submission, including the original row data and error message.

#### Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Items per page (max 200) |

#### Response (200 OK)

```json
{
  "data": [
    {
      "rowNumber": 45,
      "status": "failed",
      "errorMessage": "422 — No mapping configuration found for source 'bulk-upload' and event type 'order.unknown'",
      "rawData": {
        "eventType": "order.unknown",
        "customerEmail": "bob@example.com",
        "orderId": "ORD-045"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 12,
    "totalPages": 1
  }
}
```

---

### POST /uploads/:id/retry

Retry all failed rows for a specific upload. Resets failed rows to `pending` status and restarts background processing. The result file is regenerated after retry completes.

| Attribute | Value |
|---|---|
| **Method** | `POST` |
| **Path** | `/uploads/:id/retry` |
| **RBAC** | Admin |
| **Precondition** | Upload status must be `partial` or `failed` |

#### Response

| Status | Description | Body |
|---|---|---|
| `202 Accepted` | Retry enqueued | `{ "uploadId": "uuid", "retriedRows": 12, "status": "processing" }` |
| `400 Bad Request` | Upload not in retryable state | `{ "error": "Upload status must be 'partial' or 'failed' to retry" }` |
| `403 Forbidden` | Insufficient role (requires Admin) | `{ "error": "Insufficient permissions" }` |

---

### DELETE /uploads/:id

Cancel an in-progress upload or delete a completed upload record. If processing is active, sets status to `cancelled` and stops processing remaining rows. For completed/partial/failed uploads, deletes the upload record, associated rows, and result file.

| Attribute | Value |
|---|---|
| **Method** | `DELETE` |
| **Path** | `/uploads/:id` |
| **RBAC** | Admin |

#### Response

| Status | Description | Body |
|---|---|---|
| `200 OK` | Upload cancelled/deleted | `{ "uploadId": "uuid", "action": "cancelled" }` or `{ "uploadId": "uuid", "action": "deleted" }` |
| `403 Forbidden` | Insufficient role (requires Admin) | `{ "error": "Insufficient permissions" }` |

---

### GET /health

Health check endpoint. Returns service status, database connectivity, Event Ingestion Service reachability, and RabbitMQ connection health.

#### Response (200 OK)

```json
{
  "status": "healthy",
  "uptime": 86400,
  "checks": {
    "database": { "status": "up", "latencyMs": 3 },
    "rabbitmq": { "status": "up", "latencyMs": 8 },
    "eventIngestionService": { "status": "up", "latencyMs": 12 },
    "diskSpace": {
      "status": "up",
      "tempDirUsageMb": 45,
      "resultDirUsageMb": 230
    }
  },
  "activeUploads": 1,
  "queuedUploads": 3
}
```

---

## 8. RabbitMQ Topology (Asynchronous Logging)

The Bulk Upload Service uses RabbitMQ exclusively for fire-and-forget audit logging. All write operations to log/audit tables are performed asynchronously — the service publishes messages to the `xch.notifications.status` exchange and does not wait for acknowledgment. The Audit Service consumes and persists these messages independently.

### 8.1 Design Principle: Send and Forget

Writing log entries synchronously during file processing would add latency to every row submission. Instead, the Bulk Upload Service publishes lightweight audit messages to RabbitMQ at key lifecycle points. These messages are:

- **Non-blocking:** Published with `{ mandatory: false }` — if the message cannot be routed, it is silently discarded.
- **Fire-and-forget:** The service does not wait for consumer acknowledgment. Publishing failures are logged locally but do not interrupt processing.
- **Idempotent:** Each message includes an `eventId` (UUID) so the Audit Service can deduplicate if a message is delivered more than once.

### 8.2 Exchange & Routing

| Exchange | Type | Routing Key | Purpose |
|---|---|---|---|
| `xch.notifications.status` | Topic | `bulk-upload.upload.created` | Upload record created (file validated, queued) |
| `xch.notifications.status` | Topic | `bulk-upload.upload.processing` | Processing started by worker |
| `xch.notifications.status` | Topic | `bulk-upload.upload.progress` | Periodic progress update (per batch) |
| `xch.notifications.status` | Topic | `bulk-upload.upload.completed` | Processing finished (completed/partial/failed) |
| `xch.notifications.status` | Topic | `bulk-upload.upload.cancelled` | Upload cancelled by admin |
| `xch.notifications.status` | Topic | `bulk-upload.upload.retried` | Failed rows retried |

### 8.3 Message Schema

All messages published to RabbitMQ follow a common envelope:

```json
{
  "eventId": "uuid-v4",
  "source": "bulk-upload-service",
  "type": "bulk-upload.upload.progress",
  "timestamp": "2026-02-20T14:30:15.000Z",
  "data": {
    "uploadId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "fileName": "february-orders.xlsx",
    "uploadedBy": "user-uuid",
    "status": "processing",
    "totalRows": 500,
    "processedRows": 200,
    "succeededRows": 195,
    "failedRows": 5
  }
}
```

### Figure 8.1 — Async Logging Topology

```
┌──────────────────────────────────────┐
│       Bulk Upload Service :3158       │
│                                       │
│  Processing Pipeline                  │
│  ┌────────────┐                       │
│  │ Row N done  │                      │
│  └──────┬─────┘                       │
│         │                             │
│         ▼                             │
│  ┌────────────────────────┐           │
│  │  Publish to             │          │
│  │  xch.notifications.     │  Fire-   │
│  │  status exchange        │  and-    │
│  │                         │  forget  │
│  └──────┬─────────────────┘           │
│         │  (non-blocking)             │
└─────────┼─────────────────────────────┘
          │
          ▼
┌──────────────────────────────┐
│  xch.notifications.status    │
│  (Topic Exchange)            │
│                              │
│  Routing keys:               │
│  bulk-upload.upload.*        │
└───────────────┬──────────────┘
                │
                ▼
   ┌─────────────────────────┐
   │  q.audit.bulk-upload     │  ◄── Bound: bulk-upload.upload.#
   │  (1 consumer)            │
   └────────────┬────────────┘
                │
                ▼
   ┌─────────────────────────┐
   │  Audit Service :3156     │
   │  Persist audit events    │
   └─────────────────────────┘
```

> **Warning:** **Message Loss Tolerance**
>
> Because audit messages are fire-and-forget, there is a small possibility of message loss during RabbitMQ restarts or network partitions. This is an acceptable trade-off: the authoritative upload state lives in the Bulk Upload Service's own PostgreSQL database (`uploads` and `upload_rows` tables). The audit messages provide supplementary observability and compliance logging, not the system of record.

---

## 9. Database Design

- **Schema:** `bulk_upload_service`
- **User:** `bulk_upload_service_user`
- **DB Script:** `bulk-upload-service/dbscripts/schema-bulk-upload-service.sql`

### uploads Table

The primary tracking table for file uploads. Each row represents one uploaded XLSX file and its aggregate processing status.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Upload identifier |
| `file_name` | `VARCHAR(255)` | `NOT NULL` | Original uploaded file name |
| `file_size` | `INTEGER` | `NOT NULL` | File size in bytes |
| `total_rows` | `INTEGER` | `NOT NULL` | Total data rows (excluding header) |
| `total_events` | `INTEGER` | | Total events to submit — equals `total_rows` in standard mode, or the unique group count in group mode. Populated when processing begins. |
| `processed_rows` | `INTEGER` | `NOT NULL DEFAULT 0` | Rows processed so far |
| `succeeded_rows` | `INTEGER` | `NOT NULL DEFAULT 0` | Rows successfully submitted |
| `failed_rows` | `INTEGER` | `NOT NULL DEFAULT 0` | Rows that failed submission |
| `status` | `VARCHAR(20)` | `NOT NULL DEFAULT 'queued'` | Upload status |
| `uploaded_by` | `UUID` | `NOT NULL` | Admin user ID who uploaded the file |
| `original_file_path` | `VARCHAR(500)` | | Path to the stored original XLSX file |
| `result_file_path` | `VARCHAR(500)` | | Path to the generated result XLSX file |
| `result_generated_at` | `TIMESTAMPTZ` | | When the result file was generated |
| `started_at` | `TIMESTAMPTZ` | | When background processing began |
| `completed_at` | `TIMESTAMPTZ` | | When processing finished |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_uploads_status` | `status` | B-Tree | Worker polling for queued uploads |
| `idx_uploads_uploaded_by` | `uploaded_by` | B-Tree | Filter uploads by user |
| `idx_uploads_created_at` | `created_at` | B-Tree | Time-range queries and FIFO ordering |
| `idx_uploads_status_created` | `status, created_at` | B-Tree (composite) | Worker claim query: `WHERE status = 'queued' ORDER BY created_at` |

### upload_rows Table

Per-row tracking for each data row in an uploaded XLSX file. Records the original data, constructed payload, submission outcome, and Event Ingestion response.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Row record identifier |
| `upload_id` | `UUID` | `NOT NULL REFERENCES uploads(id) ON DELETE CASCADE` | Parent upload reference |
| `row_number` | `INTEGER` | `NOT NULL` | Row number in the XLSX file (1-based, data rows) |
| `group_key` | `VARCHAR(500)` | | Composite group key (`{eventType}:{groupKeyValue}`) — null in standard mode, populated in group mode. All rows sharing the same `group_key` within an upload map to a single event. |
| `raw_data` | `JSONB` | `NOT NULL` | Original row data as parsed from the XLSX |
| `mapped_payload` | `JSONB` | | Constructed event payload sent to Event Ingestion |
| `event_id` | `UUID` | | Event ID returned by Event Ingestion Service (null if failed) |
| `status` | `VARCHAR(20)` | `NOT NULL DEFAULT 'pending'` | Row processing status |
| `error_message` | `TEXT` | | Error description if status is `failed` or `skipped` |
| `processed_at` | `TIMESTAMPTZ` | | When this row was processed |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_upload_rows_upload_id` | `upload_id` | B-Tree | Fast lookup of all rows for an upload |
| `idx_upload_rows_upload_status` | `upload_id, status` | B-Tree (composite) | Query failed/pending rows for retry and error listing |
| `idx_upload_rows_event_id` | `event_id` | B-Tree (partial, WHERE event_id IS NOT NULL) | Trace back from event to upload row |
| `idx_upload_rows_group_key` | `upload_id, group_key` | B-Tree (partial, WHERE group_key IS NOT NULL) | Group key lookup for multi-item row grouping |

#### Row Status Values

| Status | Description |
|---|---|
| `pending` | Row inserted, awaiting processing |
| `processing` | Currently being submitted to Event Ingestion |
| `succeeded` | Event accepted by Event Ingestion (202 or 200) |
| `failed` | Event submission failed (4xx/5xx or timeout) |
| `skipped` | Row skipped due to validation error (e.g., missing eventType) |

### Figure 9.1 — Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                            uploads                            │
├──────────────────────────────────────────────────────────────┤
│ PK  id                    UUID                                │
│     file_name             VARCHAR(255)                        │
│     file_size             INTEGER                             │
│     total_rows            INTEGER                             │
│     total_events          INTEGER          (nullable)         │
│     processed_rows        INTEGER          DEFAULT 0          │
│     succeeded_rows        INTEGER          DEFAULT 0          │
│     failed_rows           INTEGER          DEFAULT 0          │
│     status                VARCHAR(20)      DEFAULT 'queued'   │
│     uploaded_by           UUID                                │
│     original_file_path    VARCHAR(500)                        │
│     result_file_path      VARCHAR(500)                        │
│     result_generated_at   TIMESTAMPTZ                         │
│     started_at            TIMESTAMPTZ                         │
│     completed_at          TIMESTAMPTZ                         │
│     created_at            TIMESTAMPTZ      DEFAULT NOW()      │
│     updated_at            TIMESTAMPTZ      DEFAULT NOW()      │
├──────────────────────────────────────────────────────────────┤
│ IDX idx_uploads_status          (status)                      │
│ IDX idx_uploads_uploaded_by     (uploaded_by)                 │
│ IDX idx_uploads_created_at      (created_at)                  │
│ IDX idx_uploads_status_created  (status, created_at)          │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       │ 1:N (upload_id FK, ON DELETE CASCADE)
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                          upload_rows                           │
├──────────────────────────────────────────────────────────────┤
│ PK  id                    UUID                                │
│ FK  upload_id             UUID             → uploads.id       │
│     row_number            INTEGER                             │
│     group_key             VARCHAR(500)     (nullable)         │
│     raw_data              JSONB                               │
│     mapped_payload        JSONB                               │
│     event_id              UUID             (nullable)         │
│     status                VARCHAR(20)      DEFAULT 'pending'  │
│     error_message         TEXT                                │
│     processed_at          TIMESTAMPTZ                         │
├──────────────────────────────────────────────────────────────┤
│ IDX idx_upload_rows_upload_id      (upload_id)                │
│ IDX idx_upload_rows_upload_status  (upload_id, status)        │
│ IDX idx_upload_rows_event_id       (event_id) WHERE NOT NULL  │
│ IDX idx_upload_rows_group_key     (upload_id, group_key)     │
│                                    WHERE group_key NOT NULL   │
└──────────────────────────────────────────────────────────────┘
```

### Data Retention

| Data | Retention | Purge Strategy |
|---|---|---|
| Upload records | 90 days | Scheduled `purge_old_uploads()` function deletes uploads and cascading rows older than threshold |
| Upload rows | Cascades with upload | Deleted via `ON DELETE CASCADE` when parent upload is purged |
| Original XLSX files | Until result generated | Cleaned up after result file generation, or after 24h for orphaned files |
| Result XLSX files | 30 days (configurable) | Scheduled cleanup removes expired result files from disk |

#### Purge Function

`bulk_upload_service.purge_old_uploads()` is a PL/pgSQL function that removes upload records and their associated rows:

| Parameter | Default | Description |
|---|---|---|
| `p_older_than_days` | `90` | Delete uploads older than this threshold (completed/failed/cancelled only) |

**Usage:**

```sql
-- Run with default (90 days)
SELECT bulk_upload_service.purge_old_uploads();

-- Custom retention period
SELECT bulk_upload_service.purge_old_uploads(60);
```

**Returns** a JSONB summary:

```json
{
  "purged_uploads": 23,
  "purged_rows": 47500,
  "cutoff": "2025-11-22T00:00:00.000Z",
  "executed_at": "2026-02-20T02:00:00.000Z"
}
```

---

## 10. Upload Lifecycle State Machine

### Status Transitions

```
                 ┌──────────────────┐
                 │     queued        │  ◄── File uploaded, validated, record created
                 └────────┬─────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
   ┌──────────────────┐    ┌──────────────────┐
   │   processing      │    │   cancelled       │  ◄── Admin cancelled before processing
   │                    │    │   (terminal)      │
   └────────┬───────────┘    └──────────────────┘
            │
   ┌────────┼────────────────────────┐
   │        │                        │
   │        │    Admin cancels       │
   │        │    during processing   │
   │        ▼                        ▼
   │  ┌──────────┐          ┌──────────────────┐
   │  │          │          │   cancelled       │
   │  │          │          │   (terminal)      │
   │  │          │          └──────────────────┘
   │  │          │
   │  │  All rows processed?
   │  │          │
   ├──┴──────────┼──────────────────┐
   │             │                  │
   ▼             ▼                  ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│completed │  │ partial   │  │ failed   │
│(terminal)│  │           │  │          │
└──────────┘  └─────┬─────┘  └─────┬───┘
                    │              │
                    │  POST /retry │
                    └──────┬───────┘
                           │
                           ▼
                ┌──────────────────┐
                │   processing      │  ◄── Retrying failed rows only
                └──────────────────┘
```

### Status Definitions

| Status | Description | Transitions To | Trigger |
|---|---|---|---|
| `queued` | File uploaded and validated, waiting for worker | `processing`, `cancelled` | `POST /uploads` (success) |
| `processing` | Background worker is actively processing rows | `completed`, `partial`, `failed`, `cancelled` | Worker claims upload |
| `completed` | All rows processed successfully (0 failures) | — (terminal) | All rows `succeeded` |
| `partial` | Processing finished, some rows succeeded and some failed | `processing` (via retry) | Mix of `succeeded` and `failed` rows |
| `failed` | Processing finished with all rows failed, or a critical error occurred | `processing` (via retry) | All rows `failed` or critical error |
| `cancelled` | Upload cancelled by an admin user | — (terminal) | `DELETE /uploads/:id` while queued/processing |

### Invariants

- **Aggregate consistency:** `processed_rows = succeeded_rows + failed_rows` (skipped rows count toward `failed_rows`).
- **Terminal states:** `completed` and `cancelled` are terminal — no further transitions allowed.
- **Retry resets:** When retry is triggered on a `partial` or `failed` upload, only `failed` and `skipped` rows are reset to `pending`. Already-`succeeded` rows are not reprocessed.
- **Result file regeneration:** After retry completes, the result file is regenerated to reflect the updated outcomes.

---

## 11. Sequence Diagrams

### 11.1 Upload & Process Flow (Happy Path)

```
Admin UI         Gateway :3150    Bulk Upload :3158     PostgreSQL     Event Ingestion :3151    RabbitMQ
   │                 │                  │                    │                  │                   │
   │  Upload XLSX    │                  │                    │                  │                   │
   │  POST /uploads  │                  │                    │                  │                   │
   │────────────────▶│                  │                    │                  │                   │
   │                 │  Validate JWT    │                    │                  │                   │
   │                 │  Proxy request   │                    │                  │                   │
   │                 │─────────────────▶│                    │                  │                   │
   │                 │                  │  Validate file     │                  │                   │
   │                 │                  │  (format, size,    │                  │                   │
   │                 │                  │   headers, rows)   │                  │                   │
   │                 │                  │                    │                  │                   │
   │                 │                  │  Store file        │                  │                   │
   │                 │                  │  INSERT upload     │                  │                   │
   │                 │                  │  (status: queued)  │                  │                   │
   │                 │                  │───────────────────▶│                  │                   │
   │                 │                  │                    │                  │                   │
   │                 │                  │  Publish audit     │                  │                   │
   │                 │                  │  (fire-and-forget) │                  │                   │
   │                 │                  │──────────────────────────────────────────────────────────▶│
   │                 │                  │                    │                  │                   │
   │                 │  202 Accepted    │                    │                  │                   │
   │                 │◄─────────────────│                    │                  │                   │
   │  202 Accepted   │                  │                    │                  │                   │
   │◄────────────────│                  │                    │                  │                   │
   │                 │                  │                    │                  │                   │
   │                 │            ┌─────┴──────┐             │                  │                   │
   │                 │            │  Background │             │                  │                   │
   │                 │            │  Worker     │             │                  │                   │
   │                 │            └─────┬──────┘             │                  │                   │
   │                 │                  │  Claim upload      │                  │                   │
   │                 │                  │  UPDATE status =   │                  │                   │
   │                 │                  │  'processing'      │                  │                   │
   │                 │                  │───────────────────▶│                  │                   │
   │                 │                  │                    │                  │                   │
   │                 │                  │  Parse XLSX rows   │                  │                   │
   │                 │                  │  Bulk INSERT rows  │                  │                   │
   │                 │                  │  (status: pending) │                  │                   │
   │                 │                  │───────────────────▶│                  │                   │
   │                 │                  │                    │                  │                   │
   │                 │                  │  ── For each row batch ──            │                   │
   │                 │                  │                    │                  │                   │
   │                 │                  │  POST /webhooks/events               │                   │
   │                 │                  │  { sourceId: "bulk-upload", ... }     │                   │
   │                 │                  │─────────────────────────────────────▶│                   │
   │                 │                  │                    │  202 Accepted    │                   │
   │                 │                  │◄─────────────────────────────────────│                   │
   │                 │                  │                    │                  │                   │
   │                 │                  │  UPDATE row status │                  │                   │
   │                 │                  │  = 'succeeded'     │                  │                   │
   │                 │                  │───────────────────▶│                  │                   │
   │                 │                  │                    │                  │                   │
   │                 │                  │  ── End batch loop ──                │                   │
   │                 │                  │                    │                  │                   │
   │  Poll status    │                  │                    │                  │                   │
   │  GET /status    │                  │                    │                  │                   │
   │────────────────▶│─────────────────▶│                    │                  │                   │
   │  { progress }   │                  │                    │                  │                   │
   │◄────────────────│◄─────────────────│                    │                  │                   │
   │                 │                  │                    │                  │                   │
   │                 │                  │  Finalize upload   │                  │                   │
   │                 │                  │  (completed)       │                  │                   │
   │                 │                  │  Generate result   │                  │                   │
   │                 │                  │  XLSX file         │                  │                   │
   │                 │                  │───────────────────▶│                  │                   │
   │                 │                  │                    │                  │                   │
   │                 │                  │  Publish completion│                  │                   │
   │                 │                  │  (fire-and-forget) │                  │                   │
   │                 │                  │──────────────────────────────────────────────────────────▶│
   │                 │                  │                    │                  │                   │
   │  Poll status    │                  │                    │                  │                   │
   │  (completed)    │                  │                    │                  │                   │
   │────────────────▶│─────────────────▶│                    │                  │                   │
   │  { resultReady }│                  │                    │                  │                   │
   │◄────────────────│◄─────────────────│                    │                  │                   │
   │                 │                  │                    │                  │                   │
   │  Download result│                  │                    │                  │                   │
   │  GET /result    │                  │                    │                  │                   │
   │────────────────▶│─────────────────▶│                    │                  │                   │
   │  result.xlsx    │                  │                    │                  │                   │
   │◄────────────────│◄─────────────────│                    │                  │                   │
```

### 11.2 Retry Flow

```
Admin UI          Gateway :3150    Bulk Upload :3158     PostgreSQL     Event Ingestion :3151
   │                 │                  │                    │                  │
   │  Retry upload   │                  │                    │                  │
   │  POST /:id/retry│                  │                    │                  │
   │────────────────▶│─────────────────▶│                    │                  │
   │                 │                  │  Verify status     │                  │
   │                 │                  │  = partial/failed  │                  │
   │                 │                  │                    │                  │
   │                 │                  │  Reset failed rows │                  │
   │                 │                  │  to 'pending'      │                  │
   │                 │                  │  UPDATE status =   │                  │
   │                 │                  │  'processing'      │                  │
   │                 │                  │───────────────────▶│                  │
   │                 │                  │                    │                  │
   │                 │  202 Accepted    │                    │                  │
   │                 │◄─────────────────│                    │                  │
   │  202 Accepted   │                  │                    │                  │
   │◄────────────────│                  │                    │                  │
   │                 │                  │                    │                  │
   │                 │            ┌─────┴──────┐             │                  │
   │                 │            │  Background │             │                  │
   │                 │            │  Worker     │             │                  │
   │                 │            └─────┬──────┘             │                  │
   │                 │                  │  Process only      │                  │
   │                 │                  │  pending rows      │                  │
   │                 │                  │  (retried rows)    │                  │
   │                 │                  │                    │                  │
   │                 │                  │  POST /webhooks/events               │
   │                 │                  │─────────────────────────────────────▶│
   │                 │                  │  202 Accepted      │                  │
   │                 │                  │◄─────────────────────────────────────│
   │                 │                  │                    │                  │
   │                 │                  │  Finalize + regen  │                  │
   │                 │                  │  result file       │                  │
   │                 │                  │───────────────────▶│                  │
```

### 11.3 Cancellation Flow

```
Admin UI          Gateway :3150    Bulk Upload :3158     PostgreSQL
   │                 │                  │                    │
   │  Cancel upload  │                  │                    │
   │  DELETE /:id    │                  │                    │
   │────────────────▶│─────────────────▶│                    │
   │                 │                  │  Set cancellation  │
   │                 │                  │  flag              │
   │                 │                  │                    │
   │                 │                  │  UPDATE status =   │
   │                 │                  │  'cancelled'       │
   │                 │                  │───────────────────▶│
   │                 │                  │                    │
   │                 │                  │  Worker detects    │
   │                 │                  │  flag, stops       │
   │                 │                  │  processing        │
   │                 │                  │                    │
   │                 │  200 OK          │                    │
   │                 │◄─────────────────│                    │
   │  200 OK         │                  │                    │
   │◄────────────────│                  │                    │
```

---

## 12. Error Handling

### 12.1 Error Categories

| Category | Scope | Handling | Blocks Processing |
|---|---|---|---|
| **File validation** | Upload-level | Reject immediately with `400 Bad Request`; no upload record created | Yes (no processing started) |
| **Row validation** | Per-row | Mark row as `skipped` with descriptive error; processing continues | No |
| **Event Ingestion 4xx** | Per-row | Mark row as `failed` with HTTP status and error body; processing continues | No |
| **Event Ingestion 5xx/timeout** | Per-row | Mark row as `failed`; processing continues. Retryable via `POST /retry`. | No |
| **Event Ingestion unreachable** | Batch-level | After 3 consecutive failures, pause batch processing for 30 seconds (circuit breaker). If still unreachable, mark remaining rows as `failed`. | Temporarily |
| **Database error** | Upload-level | Log error, mark upload as `failed`, preserve partial progress | Yes |
| **Disk space exhausted** | Upload-level | Reject new uploads with `507 Insufficient Storage`; existing uploads continue if possible | Yes (new uploads) |

### 12.2 Circuit Breaker for Event Ingestion

The worker implements a simple circuit breaker to protect against sustained Event Ingestion Service unavailability:

```
                         ┌──────────────────┐
                         │     CLOSED        │  ◄── Normal operation
                         │  (requests pass)  │
                         └────────┬─────────┘
                                  │
                         3 consecutive 5xx/timeouts
                                  │
                                  ▼
                         ┌──────────────────┐
                         │     OPEN          │  ◄── Requests blocked
                         │  (30s cooldown)   │      Rows queued locally
                         └────────┬─────────┘
                                  │
                         30 seconds elapsed
                                  │
                                  ▼
                         ┌──────────────────┐
                         │   HALF-OPEN       │  ◄── Single test request
                         └────────┬─────────┘
                                  │
                       ┌──────────┴──────────┐
                    Success               Failure
                       │                     │
                       ▼                     ▼
              ┌──────────────┐      ┌──────────────┐
              │   CLOSED      │      │   OPEN        │
              │  (resume)     │      │  (wait again) │
              └──────────────┘      └──────────────┘
```

| Parameter | Default | Description |
|---|---|---|
| `CIRCUIT_BREAKER_THRESHOLD` | `3` | Consecutive failures to trip the breaker |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | `30000` | Time to wait before attempting recovery |

### 12.3 Row-Level Error Examples

| Scenario | Row Status | Error Message |
|---|---|---|
| Missing `eventType` value | `skipped` | `Missing required 'eventType' value` |
| Empty row (all cells empty) | `skipped` | `Empty row — no data to process` |
| Event Ingestion returns 422 | `failed` | `422 — No mapping configuration found for source 'bulk-upload' and event type 'order.unknown'` |
| Event Ingestion returns 400 | `failed` | `400 — Missing required field: customerId` |
| Event Ingestion returns 500 | `failed` | `500 — Internal server error` |
| Event Ingestion timeout | `failed` | `Request timeout after 10000ms` |
| Duplicate event (200) | `succeeded` | — (stored as succeeded with existing event_id) |
| Missing group key value (group mode) | `skipped` | `Missing group key value in 'orderId' column` |
| All item fields empty (group mode) | `skipped` | `All item fields empty` |
| Inconsistent order-level data (group mode, strict) | `failed` | `Inconsistent order-level data for group key 'ORD-001': customerEmail differs across rows 2 and 5` |

---

## 13. Security Considerations

### 13.1 RBAC Enforcement

All endpoints are protected by the Notification Gateway's JWT authentication. Role requirements vary by operation:

| Operation | Required Role | Justification |
|---|---|---|
| Upload file (`POST /uploads`) | Admin, Operator | Uploading files triggers notifications — requires operative access |
| List uploads (`GET /uploads`) | Admin, Operator, Viewer | Read-only operation |
| View status (`GET /uploads/:id/status`) | Admin, Operator, Viewer | Read-only operation |
| Download result (`GET /uploads/:id/result`) | Admin, Operator, Viewer | Read-only operation |
| View errors (`GET /uploads/:id/errors`) | Admin, Operator, Viewer | Read-only operation |
| Retry failed rows (`POST /uploads/:id/retry`) | Admin | Retry triggers additional events — restricted to Admin |
| Cancel/delete upload (`DELETE /uploads/:id`) | Admin | Destructive operation — restricted to Admin |

### 13.2 File Validation

| Check | Purpose |
|---|---|
| File extension validation (`.xlsx` only) | Prevent uploading non-spreadsheet files |
| MIME type validation | Prevent MIME type spoofing (double-check beyond extension) |
| File size limit (10 MB) | Prevent resource exhaustion and denial of service |
| Row count limit (5,000) | Prevent excessive downstream load and long processing times |
| Header sanitization | Column names are sanitized to prevent injection via header values |
| Content scanning | Cell values are type-checked; formulas are not executed |

### 13.3 Rate Limiting

| Limit | Scope | Value | Purpose |
|---|---|---|---|
| Upload rate | Per user | 10 uploads per hour | Prevent upload spam |
| Event submission rate | Per worker | 50 events/second | Protect Event Ingestion Service from overload |
| Concurrent processing | Per instance | 1 upload at a time | Prevent memory exhaustion from parallel XLSX parsing |

### 13.4 Audit Trail

All upload operations are logged via RabbitMQ fire-and-forget messages to the Audit Service:

- Upload created (who, when, file name, row count)
- Processing started/completed (timing, outcome)
- Retry triggered (who, which rows)
- Upload cancelled/deleted (who, when)

---

## 14. Monitoring & Health Checks

### Key Metrics

| Metric | Description | Alert Threshold |
|---|---|---|
| `bulk_upload_uploads_total` | Total uploads received (by status) | — |
| `bulk_upload_rows_processed_total` | Total rows processed (by outcome: succeeded/failed/skipped) | — |
| `bulk_upload_rows_failed_total` | Total rows that failed submission | > 100/hour |
| `bulk_upload_processing_duration_ms` | Upload processing latency (p50, p95, p99) | p99 > 300,000ms |
| `bulk_upload_row_submission_duration_ms` | Per-row submission latency to Event Ingestion (p50, p95, p99) | p99 > 5,000ms |
| `bulk_upload_circuit_breaker_trips_total` | Circuit breaker trip count | > 0 |
| `bulk_upload_queued_uploads` | Number of uploads waiting for processing | > 10 |
| `bulk_upload_active_uploads` | Number of uploads currently being processed | — |
| `bulk_upload_result_files_size_bytes` | Total disk usage for result files | > 1 GB |
| `bulk_upload_event_ingestion_errors_total` | HTTP error responses from Event Ingestion (by status code) | > 50/hour |
| `bulk_upload_audit_publish_failures_total` | Failed fire-and-forget audit message publishes | > 10/hour |

### Structured Logging

All log entries use structured JSON format:

```json
{
  "timestamp": "2026-02-20T14:30:15.123Z",
  "level": "info",
  "service": "bulk-upload-service",
  "uploadId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "message": "Row processed successfully",
  "rowNumber": 42,
  "eventId": "evt-uuid",
  "durationMs": 85
}
```

> **Info:** **Prometheus + Grafana:** All metrics are exposed via a `/metrics` endpoint in Prometheus format. A pre-configured Grafana dashboard provides visibility into upload throughput, processing latency, failure rates, Event Ingestion health, circuit breaker state, and disk usage. Alerts are configured for critical thresholds.

---

## 15. Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3158` | HTTP server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `RABBITMQ_URL` | — | RabbitMQ connection string (AMQP) |
| `EVENT_INGESTION_URL` | `http://localhost:3151` | Event Ingestion Service base URL |
| `UPLOAD_TEMP_DIR` | `./uploads/temp` | Temporary directory for uploaded XLSX files |
| `UPLOAD_RESULT_DIR` | `./uploads/results` | Directory for generated result XLSX files |
| `UPLOAD_MAX_FILE_SIZE_MB` | `10` | Maximum upload file size in megabytes |
| `UPLOAD_MAX_ROWS` | `5000` | Maximum data rows per XLSX file |
| `GROUP_KEY_COLUMN` | `orderId` | Column used as the group key in group mode (combined with `eventType` to form the composite key) |
| `GROUP_ITEMS_PREFIX` | `item.` | Column name prefix that identifies item-level fields and activates group mode |
| `GROUP_ITEMS_TARGET_FIELD` | `items` | Name of the array field in the event payload where item objects are collected |
| `GROUP_CONFLICT_MODE` | `warn` | How to handle conflicting order-level data across rows in a group: `warn` (use first row, log warning) or `strict` (fail entire group) |
| `WORKER_BATCH_SIZE` | `50` | Number of rows processed per database iteration |
| `WORKER_CONCURRENCY` | `5` | Maximum parallel HTTP requests to Event Ingestion |
| `WORKER_RATE_LIMIT` | `50` | Maximum events submitted per second |
| `WORKER_POLL_INTERVAL_MS` | `2000` | Polling interval for queued uploads |
| `WORKER_REQUEST_TIMEOUT_MS` | `10000` | HTTP timeout per Event Ingestion request |
| `CIRCUIT_BREAKER_THRESHOLD` | `3` | Consecutive failures to trip circuit breaker |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | `30000` | Circuit breaker recovery wait time |
| `RESULT_RETENTION_DAYS` | `30` | Days to retain result XLSX files on disk |
| `UPLOAD_RETENTION_DAYS` | `90` | Days to retain upload records in database |
| `UPLOAD_RATE_LIMIT_PER_HOUR` | `10` | Maximum uploads per user per hour |
| `LOG_LEVEL` | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `HEALTH_CHECK_INTERVAL_MS` | `30000` | Health check polling interval |

---

*Notification API Documentation v1.1 -- Architecture Team -- 2026*
