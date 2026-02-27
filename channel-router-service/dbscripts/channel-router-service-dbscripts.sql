-- =============================================================================
-- Channel Router Service — Database Objects
-- Schema: channel_router_service
-- =============================================================================
-- This file contains all database object definitions (tables, indexes, functions,
-- triggers, views, etc.) for the channel-router-service.
--
-- IMPORTANT: This file must be updated every time a database change is made to
-- this service. Keep all object definitions here as the single source of truth
-- for the service's database structure (excluding schema/role/user creation,
-- which lives in schema-channel-router-service.sql).
-- =============================================================================

SET search_path TO channel_router_service;

-- =============================================================================
-- HELPER: updated_at trigger function
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TABLE: channels
-- Channel definitions for the four supported notification channels.
-- =============================================================================

CREATE TABLE IF NOT EXISTS channels (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(50)     NOT NULL,
    type                VARCHAR(20)     NOT NULL
                            CHECK (type IN ('email', 'sms', 'whatsapp', 'push')),
    is_active           BOOLEAN         NOT NULL DEFAULT true,
    routing_mode        VARCHAR(20)     NOT NULL DEFAULT 'primary'
                            CHECK (routing_mode IN ('primary', 'weighted', 'failover')),
    fallback_channel_id UUID            REFERENCES channels(id),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_channels_updated_at
    BEFORE UPDATE ON channels
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- TABLE: channel_configs
-- Channel-level settings (sender identity, limits, provider-agnostic settings).
-- =============================================================================

CREATE TABLE IF NOT EXISTS channel_configs (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id          UUID            NOT NULL REFERENCES channels(id),
    config_key          VARCHAR(100)    NOT NULL,
    config_value        TEXT            NOT NULL,
    is_encrypted        BOOLEAN         NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_channel_configs_channel_key UNIQUE (channel_id, config_key)
);

CREATE INDEX idx_channel_configs_channel ON channel_configs (channel_id);

CREATE TRIGGER trg_channel_configs_updated_at
    BEFORE UPDATE ON channel_configs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- TABLE: provider_configs
-- Provider adapter service registration, configuration, and circuit breaker state.
-- =============================================================================

CREATE TABLE IF NOT EXISTS provider_configs (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name               VARCHAR(50)     NOT NULL,
    provider_id                 VARCHAR(50)     NOT NULL,
    channel                     VARCHAR(20)     NOT NULL
                                    CHECK (channel IN ('email', 'sms', 'whatsapp', 'push')),
    adapter_url                 VARCHAR(255)    NOT NULL,
    config_json                 JSONB,
    is_active                   BOOLEAN         NOT NULL DEFAULT true,
    routing_weight              INTEGER         DEFAULT 100,
    rate_limit_tokens_per_sec   INTEGER,
    rate_limit_max_burst        INTEGER,
    circuit_breaker_state       VARCHAR(20)     NOT NULL DEFAULT 'CLOSED'
                                    CHECK (circuit_breaker_state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
    failure_count               INTEGER         NOT NULL DEFAULT 0,
    last_failure_at             TIMESTAMPTZ,
    last_health_check           TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_provider_configs_adapter_url ON provider_configs (adapter_url);
CREATE INDEX idx_provider_configs_channel_active ON provider_configs (channel, is_active);

CREATE TRIGGER trg_provider_configs_updated_at
    BEFORE UPDATE ON provider_configs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- TABLE: delivery_attempts
-- Record of each delivery attempt per notification per channel.
-- Highest-volume table in schema (>99% of storage).
-- =============================================================================

CREATE TABLE IF NOT EXISTS delivery_attempts (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id         UUID            NOT NULL,
    correlation_id          UUID,
    channel                 VARCHAR(20)     NOT NULL,
    provider_id             UUID            NOT NULL REFERENCES provider_configs(id),
    attempt_number          INTEGER         NOT NULL DEFAULT 1,
    status                  VARCHAR(20)     NOT NULL,
    provider_response       JSONB,
    provider_message_id     VARCHAR(255),
    error_message           TEXT,
    metadata                JSONB,
    attempted_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    duration_ms             INTEGER
);

CREATE INDEX idx_delivery_attempts_notification ON delivery_attempts (notification_id);
CREATE INDEX idx_delivery_attempts_provider_msg ON delivery_attempts (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX idx_delivery_attempts_channel_status ON delivery_attempts (channel, status, attempted_at);
CREATE INDEX idx_delivery_attempts_attempted_at ON delivery_attempts (attempted_at);
CREATE INDEX idx_delivery_attempts_correlation ON delivery_attempts (correlation_id) WHERE correlation_id IS NOT NULL;

-- =============================================================================
-- FUNCTION: purge_delivery_attempts
-- Deletes delivery attempt rows older than a configurable threshold (default 6 months).
-- Intended for scheduled execution via pg_cron or application-level job.
-- =============================================================================

CREATE OR REPLACE FUNCTION purge_delivery_attempts(
    retention_days INTEGER DEFAULT 180
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM delivery_attempts
    WHERE attempted_at < NOW() - (retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
