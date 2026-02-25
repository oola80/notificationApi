-- =============================================================================
-- Notification Engine Service — Database Objects
-- Schema: notification_engine_service
-- =============================================================================
-- This file contains all database object definitions (tables, indexes, functions,
-- triggers, views, etc.) for the notification-engine-service.
--
-- IMPORTANT: This file must be updated every time a database change is made to
-- this service. Keep all object definitions here as the single source of truth
-- for the service's database structure (excluding schema/role/user creation,
-- which lives in schema-notification-engine-service.sql).
-- =============================================================================

SET search_path TO notification_engine_service;

-- -----------------------------------------------------------------------------
-- Table: notification_rules
-- Stores notification rule definitions. Small table (tens to low hundreds of
-- rows) accessed on every event for rule matching.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_rules (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(255) NOT NULL,
    description       TEXT,
    event_type        VARCHAR(100) NOT NULL,
    conditions        JSONB,
    actions           JSONB       NOT NULL,
    suppression       JSONB,
    delivery_priority VARCHAR(10),
    priority          INTEGER     NOT NULL DEFAULT 100,
    is_exclusive      BOOLEAN     NOT NULL DEFAULT false,
    is_active         BOOLEAN     NOT NULL DEFAULT true,
    created_by        VARCHAR(100),
    updated_by        VARCHAR(100),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notification_rules IS 'Notification rule definitions — evaluated on every inbound event';

-- Rule lookup by event type (hot path)
CREATE INDEX IF NOT EXISTS idx_rules_event_type_active
    ON notification_rules (event_type, is_active, priority);

-- -----------------------------------------------------------------------------
-- Table: recipient_groups
-- Stores recipient group definitions for group-based notification delivery.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipient_groups (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL UNIQUE,
    description     TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE recipient_groups IS 'Recipient group definitions for group-based notification delivery';

-- -----------------------------------------------------------------------------
-- Table: recipient_group_members
-- Individual members belonging to a recipient group.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipient_group_members (
    id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id        UUID        NOT NULL REFERENCES recipient_groups(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL,
    phone           VARCHAR(50),
    device_token    TEXT,
    member_name     VARCHAR(255),
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE recipient_group_members IS 'Individual members belonging to a recipient group';

CREATE INDEX IF NOT EXISTS idx_group_members_group
    ON recipient_group_members (group_id, is_active);

-- -----------------------------------------------------------------------------
-- Table: customer_channel_preferences
-- Per-customer per-channel opt-in/opt-out preferences. High-write table with
-- FILLFACTOR 90 and tuned autovacuum for frequent upserts.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_channel_preferences (
    id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id     VARCHAR(100) NOT NULL,
    channel         VARCHAR(20)  NOT NULL,
    is_opted_in     BOOLEAN     NOT NULL DEFAULT true,
    source_system   VARCHAR(50),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (customer_id, channel)
) WITH (fillfactor = 90, autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);

COMMENT ON TABLE customer_channel_preferences IS 'Per-customer per-channel opt-in/opt-out preferences';

CREATE INDEX IF NOT EXISTS idx_cust_prefs_customer_id
    ON customer_channel_preferences (customer_id);

-- -----------------------------------------------------------------------------
-- Table: critical_channel_overrides
-- Configurable forced-channel rules per event type. Active overrides bypass
-- customer preferences to ensure critical notifications are always delivered.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS critical_channel_overrides (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      VARCHAR(100) NOT NULL,
    channel         VARCHAR(20)  NOT NULL,
    reason          TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_by      VARCHAR(100),
    updated_by      VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_type, channel)
);

COMMENT ON TABLE critical_channel_overrides IS 'Forced-channel rules per event type — bypasses customer preferences';

CREATE INDEX IF NOT EXISTS idx_overrides_event_type_active
    ON critical_channel_overrides (event_type) WHERE is_active = true;

-- -----------------------------------------------------------------------------
-- Table: notifications
-- Core notification records. High-volume table — one row per channel per
-- recipient per triggered rule. BIGSERIAL PK for insert performance;
-- notification_id UUID for external references.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id                  BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    notification_id     UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    event_id            UUID        NOT NULL,
    rule_id             UUID        NOT NULL,
    template_id         VARCHAR(100) NOT NULL,
    template_version    INTEGER,
    channel             VARCHAR(20)  NOT NULL,
    status              VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    priority            VARCHAR(10)  NOT NULL DEFAULT 'normal',
    recipient_email     VARCHAR(255),
    recipient_phone     VARCHAR(50),
    recipient_name      VARCHAR(255),
    customer_id         VARCHAR(100),
    dedup_key_hash      CHAR(64),
    dedup_key_values    JSONB,
    rendered_content    JSONB,
    correlation_id      UUID,
    cycle_id            VARCHAR(255),
    source_id           VARCHAR(50),
    event_type          VARCHAR(100),
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
) WITH (fillfactor = 80);

COMMENT ON TABLE notifications IS 'Core notification records — one per channel per recipient per triggered rule';

ALTER TABLE notifications SET (
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_analyze_scale_factor = 0.01,
    autovacuum_vacuum_cost_delay = 2
);

-- Suppression lookups: ruleId + dedupKeyHash + created_at window
-- INCLUDE (status) enables index-only scans; dedup_key_hash IS NOT NULL shrinks the index
CREATE INDEX IF NOT EXISTS idx_notifications_suppression
    ON notifications (rule_id, dedup_key_hash, created_at DESC)
    INCLUDE (status)
    WHERE dedup_key_hash IS NOT NULL AND status != 'FAILED';

-- Status-based queries (lifecycle dashboard, queue monitoring)
CREATE INDEX IF NOT EXISTS idx_notifications_status
    ON notifications (status, created_at DESC);

-- Event correlation
CREATE INDEX IF NOT EXISTS idx_notifications_event_id
    ON notifications (event_id);

-- Recipient-based lookups
CREATE INDEX IF NOT EXISTS idx_notifications_recipient
    ON notifications (recipient_email, created_at DESC);

-- Time-based queries (purge, retention)
CREATE INDEX IF NOT EXISTS idx_notifications_created_at
    ON notifications (created_at);

-- Rule-based analytics
CREATE INDEX IF NOT EXISTS idx_notifications_rule_id
    ON notifications (rule_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Table: notification_status_log
-- Immutable audit log of every status transition for a notification.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_status_log (
    id                  BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    notification_id     UUID        NOT NULL,
    from_status         VARCHAR(20),
    to_status           VARCHAR(20)  NOT NULL,
    channel             VARCHAR(20),
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notification_status_log IS 'Immutable audit log of notification status transitions';

CREATE INDEX IF NOT EXISTS idx_status_log_notification_id
    ON notification_status_log (notification_id, created_at ASC);

-- Time-based queries (purge, retention)
CREATE INDEX IF NOT EXISTS idx_status_log_created_at
    ON notification_status_log (created_at);

ALTER TABLE notification_status_log SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

-- -----------------------------------------------------------------------------
-- Table: notification_recipients
-- Per-notification recipient details for multi-recipient notifications.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_recipients (
    id                  BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    notification_id     UUID        NOT NULL,
    recipient_type      VARCHAR(20)  NOT NULL,
    email               VARCHAR(255),
    phone               VARCHAR(50),
    device_token        TEXT,
    member_name         VARCHAR(255),
    status              VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
) WITH (fillfactor = 85);

COMMENT ON TABLE notification_recipients IS 'Per-notification recipient details for multi-recipient notifications';

ALTER TABLE notification_recipients SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

CREATE INDEX IF NOT EXISTS idx_recipients_notification_id
    ON notification_recipients (notification_id);

-- -----------------------------------------------------------------------------
-- Function: purge_notification_content
-- NULLs out rendered_content on notifications older than a configurable threshold
-- (default 90 days). Processes in batches to yield to other transactions.
-- Returns JSONB: { purged_rows, cutoff, executed_at }
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION purge_notification_content(
    p_older_than_days INTEGER DEFAULT 90,
    p_batch_size      INTEGER DEFAULT 10000
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_cutoff      TIMESTAMPTZ;
    v_total       BIGINT := 0;
    v_batch_count BIGINT;
BEGIN
    v_cutoff := NOW() - (p_older_than_days || ' days')::INTERVAL;

    LOOP
        UPDATE notifications
        SET    rendered_content = NULL,
               updated_at      = NOW()
        WHERE  id IN (
            SELECT id
            FROM   notifications
            WHERE  created_at < v_cutoff
              AND  rendered_content IS NOT NULL
            LIMIT  p_batch_size
            FOR UPDATE SKIP LOCKED
        );

        GET DIAGNOSTICS v_batch_count = ROW_COUNT;
        v_total := v_total + v_batch_count;

        EXIT WHEN v_batch_count = 0;

        -- Yield to other transactions between batches
        PERFORM pg_sleep(0.1);
    END LOOP;

    RETURN jsonb_build_object(
        'purged_rows',  v_total,
        'cutoff',       v_cutoff,
        'executed_at',  NOW()
    );
END;
$$;
