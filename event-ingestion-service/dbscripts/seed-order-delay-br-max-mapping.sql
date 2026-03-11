-- =============================================================================
-- Seed: order.delay.br.max Event Mapping (bulk-upload source)
-- Schema: event_ingestion_service
-- =============================================================================
-- Inserts the event mapping for the "order.delay.br.max" event type from the
-- "bulk-upload" source system. This is a variant of order.delay specific to
-- the MAX brand (Guatemala), adding 3 new fields: newPromiseDate, sellerId,
-- sellerName.
--
-- Run once against the database after event_ingestion_service tables exist:
--   psql -U event_ingestion_service_user -d postgres -f seed-order-delay-br-max-mapping.sql
--
-- Idempotent: will fail on unique index if an active mapping for
-- (bulk-upload, order.delay.br.max) already exists.
-- =============================================================================

SET search_path TO event_ingestion_service;

INSERT INTO event_ingestion_service.event_mappings (
    source_id,
    event_type,
    name,
    description,
    field_mappings,
    priority,
    is_active,
    created_by
)
VALUES (
    'bulk-upload',
    'order.delay.br.max',
    'Bulk Upload — Order Delay BR Max',
    'Maps bulk-upload XLSX fields for order.delay.br.max event type (MAX brand, Guatemala). Identity mappings — payload field names match normalized field names. Adds newPromiseDate, sellerId, sellerName vs standard order.delay.',
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
        "customerId": {
            "source": "customerId",
            "target": "customerId"
        },
        "phone": {
            "source": "phone",
            "target": "phone"
        },
        "message": {
            "source": "message",
            "target": "message"
        },
        "images": {
            "source": "images",
            "target": "images"
        },
        "trackingNumber": {
            "source": "trackingNumber",
            "target": "trackingNumber"
        },
        "carrierId": {
            "source": "carrierId",
            "target": "carrierId"
        },
        "trackingURL": {
            "source": "trackingURL",
            "target": "trackingURL"
        },
        "promiseDate": {
            "source": "promiseDate",
            "target": "promiseDate"
        },
        "items": {
            "source": "items",
            "target": "items"
        },
        "newPromiseDate": {
            "source": "newPromiseDate",
            "target": "newPromiseDate"
        },
        "sellerId": {
            "source": "sellerId",
            "target": "sellerId"
        },
        "sellerName": {
            "source": "sellerName",
            "target": "sellerName"
        }
    }'::jsonb,
    'normal',
    true,
    'seed-script'
);

-- =============================================================================
-- Verification query — run after seed to confirm:
-- =============================================================================
-- SELECT id, source_id, event_type, name, priority, is_active,
--        jsonb_object_keys(field_mappings) AS mapped_fields
-- FROM event_ingestion_service.event_mappings
-- WHERE source_id = 'bulk-upload' AND event_type = 'order.delay.br.max';
-- =============================================================================
