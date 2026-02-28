# Bulk Upload Template: order.delay

> **Scenario:** Send delay notifications for orders that will not arrive on the original promise date. Each order may contain multiple line items. The XLSX uses **group mode** to collapse multiple rows (one per item) into a single event per order.

## XLSX Column Layout

| # | Column | Type | Required | Description |
|---|--------|------|----------|-------------|
| 1 | `eventType` | string | Yes | Must be `order.delay` for every row |
| 2 | `cycleId` | string | Yes | Business cycle identifier (shared across the batch) |
| 3 | `customerId` | string | Yes | Unique customer identifier (e.g. email, account ID) |
| 4 | `customerEmail` | string | Yes | Customer email address for delivery |
| 5 | `customerName` | string | Yes | Customer display name |
| 6 | `orderId` | string | Yes | Order identifier — **group key** (rows with the same `orderId` are merged into one event) |
| 7 | `phone` | string | No | Customer phone number (use text format to preserve leading zeros) |
| 8 | `message` | string | Yes | Notification body text (supports UTF-8, accented characters, etc.) |
| 9 | `images` | JSON string | No | JSON array of image objects, e.g. `[{"url":"https://..."}]` — parsed to an array at ingestion |
| 10 | `trackingNumber` | string | No | Shipping tracking number |
| 11 | `carrierId` | string | No | Carrier identifier (e.g. `FORZA_GT`) |
| 12 | `trackingURL` | string | No | Carrier tracking page URL |
| 13 | `promiseDate` | string | No | New estimated delivery date in ISO 8601 format (e.g. `2026-02-25T06:10:00Z`) |
| 14 | `item.sku` | string | Yes | Item SKU — `item.` prefix marks this as an item-level field |
| 15 | `item.name` | string | Yes | Item display name |
| 16 | `item.quantity` | number | Yes | Quantity ordered |
| 17 | `item.price` | number | Yes | Unit price |

> **Note:** Columns prefixed with `item.` are item-level fields. The service automatically detects the prefix, activates **group mode**, and collects item-level fields into an `items[]` array in the event payload. The prefix is stripped from the field names (e.g. `item.sku` → `sku`).

## Group Mode Configuration

The following environment variables control group mode behavior. These are set in the service `.env` file:

| Variable | Value | Description |
|----------|-------|-------------|
| `GROUP_KEY_COLUMN` | `orderId` | Column whose value identifies which rows belong to the same group |
| `GROUP_ITEMS_PREFIX` | `item.` | Column name prefix that identifies item-level fields |
| `GROUP_ITEMS_TARGET_FIELD` | `items` | Name of the array field in the event payload where item objects are collected |
| `GROUP_CONFLICT_MODE` | `warn` | What happens when order-level fields differ across rows in the same group: `warn` = log warning and use first row's value; `strict` = mark group as failed |

> **Important:** The service hardcodes `sourceId: 'bulk-upload'` — this is not configurable per upload.

## Example XLSX Data

The test file `test-order-delay.xlsx` contains 3 data rows that produce 2 events:

```
eventType   | cycleId | customerId              | customerEmail           | customerName | orderId       | phone    | message          | images  | trackingNumber | carrierId | trackingURL                        | promiseDate              | item.sku | item.name                                       | item.quantity | item.price
order.delay | 123132  | omar-ola@hotmail7.com   | omar-ola@hotmail.com    | Omar Ola     | 611214544-A   | 40009954 | Lamentamos (...) | [{...}] | FD15454        | FORZA_GT  | https://www.forzadelivery.com/gt/  | 2026-02-25T06:10:00Z     | RUSH     | Ventilador de piso y pared Taurus de 20 pulgadas | 1             | 79.99
order.delay | 123132  | omar-ola@hotmail7.com   | omar-ola@hotmail.com    | Omar Ola     | 611214544-A   | 40009954 | Lamentamos (...) | [{...}] | FD15454        | FORZA_GT  | https://www.forzadelivery.com/gt/  | 2026-02-25T06:10:00Z     | FAN-20   | Ventilador de techo industrial 52 pulgadas        | 2             | 129.99
order.delay | 123132  | maria.garcia@example.com| maria.garcia@example.com| Maria Garcia | 611214544-B   | 50012345 | Lamentamos (...) | [{...}] | FD15499        | FORZA_GT  | https://www.forzadelivery.com/gt/  | 2026-02-26T08:00:00Z     | TV-55    | Smart TV LED 55 pulgadas 4K                       | 1             | 499.99
```

- **Rows 1-2** share `orderId: 611214544-A` → grouped into **1 event** with 2 items
- **Row 3** has `orderId: 611214544-B` → **1 event** with 1 item

## Resulting Event Payload

Each group produces a single event submitted to the Event Ingestion Service. Example for order `611214544-A`:

```json
{
  "sourceId": "bulk-upload",
  "cycleId": "123132",
  "eventType": "order.delay",
  "sourceEventId": "{uploadId}-group-order.delay-611214544-A",
  "timestamp": "2026-02-27T...",
  "payload": {
    "customerId": "omar-ola@hotmail7.com",
    "customerEmail": "omar-ola@hotmail.com",
    "customerName": "Omar Ola",
    "orderId": "611214544-A",
    "phone": "40009954",
    "message": "Lamentamos (sorry) informarle que su pedido ha sufrido un retraso. Se estara entregando el dia de mañana",
    "images": [
      {
        "url": "https://backoffice.max.com.gt/media/catalog/product/cache/94dd7777337ccc7ac42c8ee85d48fab6/r/u/rush.jpg"
      }
    ],
    "trackingNumber": "FD15454",
    "carrierId": "FORZA_GT",
    "trackingURL": "https://www.forzadelivery.com/gt/",
    "promiseDate": "2026-02-25T06:10:00Z",
    "items": [
      {
        "sku": "RUSH",
        "name": "Ventilador de piso y pared Taurus de 20 pulgadas",
        "quantity": 1,
        "price": 79.99
      },
      {
        "sku": "FAN-20",
        "name": "Ventilador de techo industrial 52 pulgadas",
        "quantity": 2,
        "price": 129.99
      }
    ]
  }
}
```

## Type Coercion Notes

The bulk-upload parsing service applies automatic type coercion when reading cells:

| Scenario | Behavior |
|----------|----------|
| **Phone numbers** | Numeric values are coerced to strings. To preserve leading zeros (e.g. `00502...`), format the column as Text in Excel before entering values. |
| **JSON arrays** (`images`) | Enter the full JSON string in a single cell. The parser detects strings starting with `[` or `{` and parses them into objects/arrays. |
| **Dates** (`promiseDate`) | Enter as an ISO 8601 string (e.g. `2026-02-25T06:10:00Z`). If Excel auto-converts to a Date object, the parser converts it back to an ISO string. |
| **Numbers** (`item.quantity`, `item.price`) | Numeric cells are preserved as numbers. Strings that look like numbers are coerced to numbers. |
| **Booleans** | `true`/`false` strings and boolean cell values are preserved as booleans. |
| **Empty cells** | Omitted from the payload entirely (not set to `null` or empty string). |

## Generating the Test File

```bash
cd bulk-upload-service
node docs/generate-test-xlsx.js
```

This creates `docs/test-order-delay.xlsx` using the `exceljs` dependency already installed in the service.
