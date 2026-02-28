-- =============================================================================
-- Audit Service — Database Objects
-- Schema: audit_service
-- =============================================================================
-- This file contains all database object definitions (tables, indexes, functions,
-- triggers, views, etc.) for the audit-service.
--
-- IMPORTANT: This file must be updated every time a database change is made to
-- this service. Keep all object definitions here as the single source of truth
-- for the service's database structure (excluding schema/role/user creation,
-- which lives in schema-audit-service.sql).
-- =============================================================================

SET search_path TO audit_service;

-- =============================================================================
-- Table: audit_events
-- Immutable event log for all notification lifecycle transitions.
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_events (
    id                  UUID            NOT NULL DEFAULT gen_random_uuid(),
    notification_id     VARCHAR(255)    NULL,
    correlation_id      VARCHAR(255)    NULL,
    cycle_id            VARCHAR(255)    NULL,
    event_type          VARCHAR(100)    NOT NULL,
    actor               VARCHAR(100)    NOT NULL,
    metadata            JSONB           NULL DEFAULT '{}',
    payload_snapshot    JSONB           NULL,
    search_vector       TSVECTOR        NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_audit_events PRIMARY KEY (id)
);

-- Indexes for audit_events (7 indexes including GIN for search_vector)
CREATE INDEX IF NOT EXISTS idx_audit_events_notification_id
    ON audit_events (notification_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_correlation_id
    ON audit_events (correlation_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_cycle_id
    ON audit_events (cycle_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_event_type
    ON audit_events (event_type);

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
    ON audit_events (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor
    ON audit_events (actor);

CREATE INDEX IF NOT EXISTS idx_audit_events_search
    ON audit_events USING GIN (search_vector);

-- =============================================================================
-- Trigger: auto-generate search_vector on INSERT
-- Combines notification_id, event_type, actor, and metadata for full-text search
-- =============================================================================
CREATE OR REPLACE FUNCTION audit_service.update_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.notification_id, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.event_type, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.actor, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.correlation_id, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.cycle_id, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.metadata::text, '')), 'D');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_search_vector ON audit_events;
CREATE TRIGGER trg_audit_events_search_vector
    BEFORE INSERT ON audit_events
    FOR EACH ROW
    EXECUTE FUNCTION audit_service.update_search_vector();

-- =============================================================================
-- Table: delivery_receipts
-- Provider-reported delivery outcomes correlated to notifications.
-- =============================================================================
CREATE TABLE IF NOT EXISTS delivery_receipts (
    id                  UUID            NOT NULL DEFAULT gen_random_uuid(),
    notification_id     VARCHAR(255)    NULL,
    correlation_id      VARCHAR(255)    NULL,
    cycle_id            VARCHAR(255)    NULL,
    channel             VARCHAR(20)     NOT NULL,
    provider            VARCHAR(50)     NOT NULL,
    status              VARCHAR(30)     NOT NULL,
    provider_message_id VARCHAR(255)    NULL,
    raw_response        JSONB           NULL,
    received_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_delivery_receipts PRIMARY KEY (id)
);

-- Indexes for delivery_receipts (4 indexes)
CREATE INDEX IF NOT EXISTS idx_delivery_receipts_notification_id
    ON delivery_receipts (notification_id);

CREATE INDEX IF NOT EXISTS idx_delivery_receipts_provider_msg_id
    ON delivery_receipts (provider_message_id);

CREATE INDEX IF NOT EXISTS idx_delivery_receipts_received_at
    ON delivery_receipts (received_at);

CREATE INDEX IF NOT EXISTS idx_delivery_receipts_status
    ON delivery_receipts (status);

-- =============================================================================
-- Table: notification_analytics
-- Pre-aggregated analytics data for dashboard consumption.
-- =============================================================================
CREATE TABLE IF NOT EXISTS notification_analytics (
    id                  UUID            NOT NULL DEFAULT gen_random_uuid(),
    period              VARCHAR(10)     NOT NULL,
    period_start        TIMESTAMPTZ     NOT NULL,
    channel             VARCHAR(20)     NOT NULL,
    event_type          VARCHAR(255)    NULL,
    total_sent          INTEGER         NOT NULL DEFAULT 0,
    total_delivered     INTEGER         NOT NULL DEFAULT 0,
    total_failed        INTEGER         NOT NULL DEFAULT 0,
    total_opened        INTEGER         NOT NULL DEFAULT 0,
    total_clicked       INTEGER         NOT NULL DEFAULT 0,
    total_bounced       INTEGER         NOT NULL DEFAULT 0,
    total_suppressed    INTEGER         NOT NULL DEFAULT 0,
    avg_latency_ms      NUMERIC(10,2)   NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_notification_analytics PRIMARY KEY (id)
);

-- Indexes for notification_analytics (2 indexes — unique composite for upsert)
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_period_start
    ON notification_analytics (period, period_start, channel);

CREATE INDEX IF NOT EXISTS idx_analytics_event_type
    ON notification_analytics (period, period_start, event_type);

-- =============================================================================
-- Table: dlq_entries
-- Dead-letter queue entries for investigation and reprocessing.
-- =============================================================================
CREATE TABLE IF NOT EXISTS dlq_entries (
    id                      UUID            NOT NULL DEFAULT gen_random_uuid(),
    original_queue          VARCHAR(255)    NOT NULL,
    original_exchange       VARCHAR(255)    NOT NULL,
    original_routing_key    VARCHAR(255)    NULL,
    rejection_reason        VARCHAR(500)    NULL,
    retry_count             INTEGER         NOT NULL DEFAULT 0,
    payload                 JSONB           NOT NULL,
    x_death_headers         JSONB           NULL,
    status                  VARCHAR(20)     NOT NULL DEFAULT 'pending',
    notes                   TEXT            NULL,
    captured_at             TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    resolved_at             TIMESTAMPTZ     NULL,
    resolved_by             VARCHAR(255)    NULL,

    CONSTRAINT pk_dlq_entries PRIMARY KEY (id),
    CONSTRAINT chk_dlq_entries_status
        CHECK (status IN ('pending', 'investigated', 'reprocessed', 'discarded'))
);

-- Index for dlq_entries (1 index)
CREATE INDEX IF NOT EXISTS idx_dlq_entries_status
    ON dlq_entries (status);

-- =============================================================================
-- Function: purge_audit_payloads()
-- NULLs out payload data (audit_events.payload_snapshot,
-- delivery_receipts.raw_response) older than a configurable threshold.
-- Called via pg_cron or application scheduler (daily at 03:00).
-- =============================================================================
CREATE OR REPLACE FUNCTION audit_service.purge_audit_payloads(
    p_older_than_days INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_audit_count INTEGER;
    v_receipt_count INTEGER;
BEGIN
    v_cutoff := NOW() - (p_older_than_days || ' days')::INTERVAL;

    -- NULL out payload snapshots in audit_events
    UPDATE audit_service.audit_events
    SET payload_snapshot = NULL
    WHERE created_at < v_cutoff
      AND payload_snapshot IS NOT NULL;
    GET DIAGNOSTICS v_audit_count = ROW_COUNT;

    -- NULL out raw responses in delivery_receipts
    UPDATE audit_service.delivery_receipts
    SET raw_response = NULL
    WHERE received_at < v_cutoff
      AND raw_response IS NOT NULL;
    GET DIAGNOSTICS v_receipt_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'cutoffDate', v_cutoff,
        'auditEventsPurged', v_audit_count,
        'deliveryReceiptsPurged', v_receipt_count
    );
END;
$$;
