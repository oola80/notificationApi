# Bulk Upload — Modeling Multi-Item Rows in Excel

**Problem:** An order event may contain multiple line items (SKUs). The current bulk upload design treats each Excel row as one event. We need a mechanism for the operative team to express "one order with N items" in a flat spreadsheet and have the service consolidate them into a single event with an `items[]` array.

---

## Current State

The canonical event schema already supports an `items` array:

```json
{
  "eventType": "order.shipped",
  "orderId": "ORD-001",
  "items": [
    { "sku": "PROD-001", "name": "Headphones", "quantity": 1, "price": 79.99 },
    { "sku": "PROD-002", "name": "Cable", "quantity": 2, "price": 9.99 }
  ]
}
```

The bulk upload service already has a JSON-in-cell parsing rule (Section 6.1): columns with JSON-parseable values like `[{"sku":"X"}]` are automatically parsed. But typing JSON arrays in Excel cells is impractical for operative teams.

---

## Approaches Evaluated

### Approach A — JSON Array in Cell (Already Supported)

```
| eventType     | orderId | customerEmail    | items                                              |
|---------------|---------|------------------|----------------------------------------------------|
| order.shipped | ORD-001 | jane@example.com | [{"sku":"P1","qty":1,"price":79.99},{"sku":"P2","qty":2,"price":9.99}] |
```

| Pros | Cons |
|------|------|
| Already works, zero code changes | Terrible UX — JSON in Excel cells is error-prone |
| One row = one event (simple model) | Hard to review, audit, and modify in Excel |
| No grouping logic needed | Character limits in cells may truncate large arrays |
| | No Excel-native validation or autocomplete |

**Verdict:** Acceptable as a power-user fallback, not as the primary mechanism.

---

### Approach B — Repeated Rows with Group Key (Recommended)

Each item gets its own row. Rows sharing the same **group key** (e.g., `orderId` + `eventType`) are consolidated into a single event. A naming convention distinguishes **order-level** columns from **item-level** columns.

```
| eventType     | cycleId | orderId | customerEmail    | customerName | totalAmount | item.sku | item.name       | item.qty | item.price |
|---------------|---------|---------|------------------|--------------|-------------|----------|-----------------|----------|------------|
| order.shipped | CYC-001 | ORD-001 | jane@example.com | Jane Doe     | 99.97       | PROD-001 | Headphones      | 1        | 79.99      |
| order.shipped | CYC-001 | ORD-001 | jane@example.com | Jane Doe     | 99.97       | PROD-002 | USB Cable       | 2        | 9.99       |
| order.shipped | CYC-002 | ORD-002 | john@example.com | John Smith   | 25.00       | PROD-003 | Phone Case      | 1        | 25.00      |
```

#### Convention

- **Item-level columns** use a `item.` prefix (e.g., `item.sku`, `item.name`, `item.qty`, `item.price`).
- **Order-level columns** are everything else (no prefix): `orderId`, `customerEmail`, `totalAmount`, etc.
- **Group key** = `eventType` + `orderId` (configurable via an upload-time parameter or auto-detected).
- Rows with the same group key are merged into **one event**. Order-level values are taken from the **first row** in the group. All `item.*` columns across rows are collected into the `items[]` array.

#### Resulting Event

```json
{
  "sourceId": "bulk-upload",
  "cycleId": "CYC-001",
  "eventType": "order.shipped",
  "sourceEventId": "a1b2c3d4-group-ORD-001",
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

#### Result File Behavior

In the result XLSX, the `_notification_status` is written on **every row** of the group (all rows get `sent` or `failed` together, since they map to a single event):

```
| eventType     | orderId | customerEmail    | item.sku | item.name  | _notification_status |
|---------------|---------|------------------|----------|------------|----------------------|
| order.shipped | ORD-001 | jane@example.com | PROD-001 | Headphones | sent                 |
| order.shipped | ORD-001 | jane@example.com | PROD-002 | USB Cable  | sent                 |
| order.shipped | ORD-002 | john@example.com | PROD-003 | Phone Case | sent                 |
```

#### Database Impact — `upload_rows` Table

Two modeling options for the `upload_rows` table:

**Option B1 — One DB row per Excel row (recommended):**
- Each Excel row is still stored individually in `upload_rows`.
- A new column `group_key VARCHAR(500)` links rows that belong to the same event.
- All rows in a group share the same `event_id` and `status` after processing.
- The `row_number` preserves the original Excel position for the result file.
- Simple: no new tables, minimal schema change, result file generation stays row-by-row.

**Option B2 — One DB row per group (event):**
- Rows are pre-grouped before DB insert. Each `upload_rows` record stores the merged payload plus the list of original row numbers.
- Cleaner for event tracking, but complicates result file generation (need to fan out back to individual rows).

**Recommendation: Option B1** — it preserves the 1:1 mapping between Excel rows and DB rows, making result file generation straightforward while still supporting grouping via the `group_key`.

| Pros | Cons |
|------|------|
| Natural Excel experience — one item per row | Operative must repeat order-level data across rows |
| Easy to review and edit in Excel | Requires grouping logic in the processing pipeline |
| Works with Excel features (sort, filter, copy) | Group key detection/configuration adds complexity |
| Supports any number of items per order | Order-level data inconsistency across rows in same group needs handling |
| `item.*` prefix makes intent unambiguous | Increases total row count (a 1,000-order file with avg 3 items = 3,000 rows) |
| Result file mirrors original row structure | |

#### Handling Inconsistencies

If order-level columns differ across rows in the same group (e.g., different `customerEmail` for the same `orderId`):

- **Strategy:** Use values from the **first row** in the group. Log a warning in structured logs.
- **Optional strict mode:** If any order-level value conflicts across rows in a group, mark the entire group as `failed` with error message `"Inconsistent order-level data for group key 'ORD-001': customerEmail differs across rows 2 and 5"`.
- Configurable via environment variable: `GROUP_CONFLICT_MODE=warn` (default) or `GROUP_CONFLICT_MODE=strict`.

---

### Approach C — Dual-Sheet (Master/Detail)

Two sheets in the same XLSX workbook:

**Sheet 1: "Orders" (master)**

| eventType     | cycleId | orderId | customerEmail    | customerName | totalAmount |
|---------------|---------|---------|------------------|--------------|-------------|
| order.shipped | CYC-001 | ORD-001 | jane@example.com | Jane Doe     | 99.97       |
| order.shipped | CYC-002 | ORD-002 | john@example.com | John Smith   | 25.00       |

**Sheet 2: "Items" (detail)**

| orderId | sku      | name       | qty | price |
|---------|----------|------------|-----|-------|
| ORD-001 | PROD-001 | Headphones | 1   | 79.99 |
| ORD-001 | PROD-002 | USB Cable  | 2   | 9.99  |
| ORD-002 | PROD-003 | Phone Case | 1   | 25.00 |

The service joins Sheet 2 → Sheet 1 on `orderId` and constructs the event with an `items[]` array.

| Pros | Cons |
|------|------|
| Clean relational model, no repeated data | More complex file structure for operatives |
| No inconsistency risk (order data is in one place) | Two sheets to manage, easy to get join key wrong |
| Fewer total rows (items separate from orders) | Validation is more complex (orphan items, missing master) |
| | Result file UX unclear — which sheet gets the `_notification_status`? |
| | Upload endpoint must understand multi-sheet semantics |
| | Breaks the "any column = any field" flexible mapping model |

**Verdict:** Over-engineered for the operative audience. Introduces relational join complexity that defeats the simplicity of spreadsheet-based uploads.

---

### Approach D — Wide Columns (Numbered Suffixes)

```
| orderId | item1_sku | item1_qty | item1_price | item2_sku | item2_qty | item2_price |
|---------|-----------|-----------|-------------|-----------|-----------|-------------|
| ORD-001 | PROD-001  | 1         | 79.99       | PROD-002  | 2         | 9.99        |
```

| Pros | Cons |
|------|------|
| One row per order (simple) | Arbitrary max item count — what if an order has 20 items? |
| No grouping logic needed | Sparse columns (most cells empty for small orders) |
| | Column explosion — 5 fields × 10 max items = 50 item columns |
| | Parsing numbered suffixes is fragile |

**Verdict:** Does not scale. Rejected.

---

## Recommendation: Approach B — Repeated Rows with `item.*` Prefix

### Summary of Changes Required

#### 1. XLSX Parsing (Processing Pipeline)

- After parsing the header row, detect columns with the `item.` prefix.
- If `item.*` columns exist, activate **group mode**:
  - Determine the group key: `eventType` + value of a configurable column (default: `orderId`). Can be overridden via `groupKeyColumn` upload parameter.
  - Sort/iterate rows, collecting consecutive (or non-consecutive) rows with the same group key.
  - For each group: take order-level values from the first row, collect all `item.*` values into an `items[]` array (stripping the `item.` prefix from field names), construct one event payload.
- If no `item.*` columns exist, process as today (one row = one event).

#### 2. `upload_rows` Table Schema Change

```sql
ALTER TABLE bulk_upload_service.upload_rows
    ADD COLUMN group_key VARCHAR(500);

CREATE INDEX idx_upload_rows_group_key
    ON bulk_upload_service.upload_rows (upload_id, group_key)
    WHERE group_key IS NOT NULL;
```

#### 3. Event Payload Construction

```
Standard (no grouping):    1 Excel row  → 1 event
Grouped  (item.* present): N Excel rows → 1 event (with items[] array)
```

The `sourceEventId` for grouped events uses the group key: `{uploadId}-group-{groupKey}` instead of `{uploadId}-row-{rowNumber}`.

#### 4. Progress Tracking

- `total_rows` in the `uploads` table still counts **Excel rows** (not events). This is what the user sees and matches their file.
- A new field `total_events` (nullable, populated after grouping) tracks the actual number of events that will be submitted.
- Progress percentage is based on events processed / total events.

#### 5. Result File

- Every Excel row gets its `_notification_status` value.
- All rows in a group share the same status (they map to a single event).
- If the group fails, every row in the group shows the same error.

#### 6. Retry Behavior

- Retry operates at the **group level**. If a group failed, all rows in that group are retried together as one event.

#### 7. Validation Additions

| Validation | Criteria | Error |
|---|---|---|
| Group key column present | If `item.*` columns detected, the group key column (default `orderId`) must exist | `400: Group mode detected (item.* columns found) but required group key column 'orderId' is missing` |
| Empty group key | Rows with `item.*` columns but empty group key value | Row marked as `skipped: Missing group key value in 'orderId' column` |
| At least one item field | Rows in a group where all `item.*` cells are empty | Row marked as `skipped: All item fields empty` |

### Configuration

| Variable | Default | Description |
|---|---|---|
| `GROUP_KEY_COLUMN` | `orderId` | Column used as the group key (combined with `eventType`) |
| `GROUP_ITEMS_PREFIX` | `item.` | Column prefix that identifies item-level fields |
| `GROUP_ITEMS_TARGET_FIELD` | `items` | Name of the array field in the event payload |
| `GROUP_CONFLICT_MODE` | `warn` | How to handle conflicting order-level data: `warn` (use first row) or `strict` (fail group) |

---

## Processing Pipeline (Updated for Grouping)

```
    ┌──────────────────────────┐
    │  Parse XLSX headers       │
    └────────────┬─────────────┘
                 ▼
     ◆ item.* columns exist?  ◆
                 │
        ┌────────┴────────┐
       Yes                No
        │                  │
        ▼                  ▼
   ┌──────────┐     ┌──────────────┐
   │  GROUP   │     │  STANDARD    │
   │  MODE    │     │  MODE        │
   └────┬─────┘     │  (current    │
        │           │   behavior)  │
        ▼           └──────────────┘
   ┌──────────────────────────┐
   │  Bulk insert rows with   │
   │  group_key computed      │
   │  (eventType + orderId)   │
   └────────────┬─────────────┘
                ▼
   ┌──────────────────────────┐
   │  For each unique group:  │
   │                          │
   │  1. Collect all rows     │
   │  2. Take order-level     │
   │     from first row       │
   │  3. Build items[] from   │
   │     item.* columns       │
   │  4. Construct event      │
   │  5. POST to Event        │
   │     Ingestion            │
   │  6. Update ALL rows in   │
   │     group with same      │
   │     status + event_id    │
   └──────────────────────────┘
```

---

## Example: End-to-End

### Input XLSX

| eventType     | cycleId | orderId | customerEmail    | customerName | totalAmount | item.sku | item.name       | item.qty | item.price |
|---------------|---------|---------|------------------|--------------|-------------|----------|-----------------|----------|------------|
| order.shipped | CYC-001 | ORD-001 | jane@example.com | Jane Doe     | 99.97       | PROD-001 | Headphones      | 1        | 79.99      |
| order.shipped | CYC-001 | ORD-001 | jane@example.com | Jane Doe     | 99.97       | PROD-002 | USB Cable       | 2        | 9.99       |
| order.created | CYC-002 | ORD-002 | john@example.com | John Smith   | 25.00       | PROD-003 | Phone Case      | 1        | 25.00      |

### Groups Detected

- **Group 1:** `order.shipped + ORD-001` → rows 2–3 (2 items)
- **Group 2:** `order.created + ORD-002` → row 4 (1 item)

### Events Submitted

**Event 1:**

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

**Event 2:**

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

### Result XLSX

| eventType     | orderId | customerEmail    | item.sku | item.name  | _notification_status |
|---------------|---------|------------------|----------|------------|----------------------|
| order.shipped | ORD-001 | jane@example.com | PROD-001 | Headphones | sent                 |
| order.shipped | ORD-001 | jane@example.com | PROD-002 | USB Cable  | sent                 |
| order.created | ORD-002 | john@example.com | PROD-003 | Phone Case | sent                 |

---

## Row Count Impact

With grouping, the 5,000 row limit applies to **Excel rows**, not events. A file with 1,000 orders averaging 3 items each = 3,000 Excel rows but only 1,000 events submitted to Event Ingestion. This is more efficient in terms of downstream load but uses more Excel row capacity.

The status endpoint should report both:

```json
{
  "totalRows": 3000,
  "totalEvents": 1000,
  "processedEvents": 650,
  "progressPercent": 65.0
}
```
