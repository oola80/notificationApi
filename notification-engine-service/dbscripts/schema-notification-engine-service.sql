-- Create the schema
CREATE SCHEMA IF NOT EXISTS notification_engine_service;

-- Create the role
CREATE ROLE notification_engine_service_user_role;

-- Create the user with login capability
CREATE USER notification_engine_service_user WITH PASSWORD 'n0t1f_eng2026';

-- Grant the role to the user
GRANT notification_engine_service_user_role TO notification_engine_service_user;

-- Grant schema usage and creation privileges to the role
GRANT USAGE, CREATE ON SCHEMA notification_engine_service TO notification_engine_service_user_role;

-- Grant all privileges on all existing tables in the schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA notification_engine_service TO notification_engine_service_user_role;

-- Grant all privileges on all existing sequences in the schema
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA notification_engine_service TO notification_engine_service_user_role;

-- Grant all privileges on all existing functions in the schema
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA notification_engine_service TO notification_engine_service_user_role;

-- Set default privileges for future tables created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA notification_engine_service
    GRANT ALL PRIVILEGES ON TABLES TO notification_engine_service_user_role;

-- Set default privileges for future sequences created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA notification_engine_service
    GRANT ALL PRIVILEGES ON SEQUENCES TO notification_engine_service_user_role;

-- Set default privileges for future functions created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA notification_engine_service
    GRANT ALL PRIVILEGES ON FUNCTIONS TO notification_engine_service_user_role;

-- =============================================================================
-- customer_channel_preferences
-- Per-customer per-channel opt-in/opt-out preferences keyed by customer_id.
-- ~100K rows, ~10 MB — moderate growth, webhook-driven updates.
-- =============================================================================
CREATE TABLE notification_engine_service.customer_channel_preferences (
    id              BIGSERIAL       PRIMARY KEY,
    customer_id     VARCHAR(100)    NOT NULL,
    channel         VARCHAR(20)     NOT NULL,    -- email, sms, whatsapp, push
    is_opted_in     BOOLEAN         NOT NULL DEFAULT true,
    source_system   VARCHAR(50),                 -- which external system sent this
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cust_channel UNIQUE (customer_id, channel)
) WITH (FILLFACTOR = 90);

CREATE INDEX idx_cust_prefs_customer_id
    ON notification_engine_service.customer_channel_preferences (customer_id);

ALTER TABLE notification_engine_service.customer_channel_preferences SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

-- =============================================================================
-- critical_channel_overrides
-- Configurable rules that force specific channels for specific event types,
-- regardless of customer preferences. Tiny table (<100 rows), admin-managed.
-- =============================================================================
CREATE TABLE notification_engine_service.critical_channel_overrides (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      VARCHAR(100)    NOT NULL,    -- exact event type to match
    channel         VARCHAR(20)     NOT NULL,    -- channel forced by this override
    reason          TEXT,                         -- human-readable justification
    is_active       BOOLEAN         NOT NULL DEFAULT true,
    created_by      VARCHAR(100),
    updated_by      VARCHAR(100),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_override_event_channel UNIQUE (event_type, channel)
);

CREATE INDEX idx_overrides_event_type_active
    ON notification_engine_service.critical_channel_overrides (event_type)
    WHERE is_active = true;
