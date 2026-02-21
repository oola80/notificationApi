-- Create the schema
CREATE SCHEMA IF NOT EXISTS event_ingestion_service;

-- Create the role
CREATE ROLE event_ingestion_service_user_role;

-- Create the user with login capability
CREATE USER event_ingestion_service_user WITH PASSWORD 'ev1ng3st2026';

-- Grant the role to the user
GRANT event_ingestion_service_user_role TO event_ingestion_service_user;

-- Grant schema usage and creation privileges to the role
GRANT USAGE, CREATE ON SCHEMA event_ingestion_service TO event_ingestion_service_user_role;

-- Grant all privileges on all existing tables in the schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA event_ingestion_service TO event_ingestion_service_user_role;

-- Grant all privileges on all existing sequences in the schema
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA event_ingestion_service TO event_ingestion_service_user_role;

-- Grant all privileges on all existing functions in the schema
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA event_ingestion_service TO event_ingestion_service_user_role;

-- Set default privileges for future tables created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA event_ingestion_service
    GRANT ALL PRIVILEGES ON TABLES TO event_ingestion_service_user_role;

-- Set default privileges for future sequences created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA event_ingestion_service
    GRANT ALL PRIVILEGES ON SEQUENCES TO event_ingestion_service_user_role;

-- Set default privileges for future functions created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA event_ingestion_service
    GRANT ALL PRIVILEGES ON FUNCTIONS TO event_ingestion_service_user_role;

-- ============================================================================
-- event_mappings — Runtime field mapping configuration per (source_id, event_type)
-- ============================================================================
CREATE TABLE event_ingestion_service.event_mappings (
    id                   UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id            VARCHAR(50)     NOT NULL,
    event_type           VARCHAR(100)    NOT NULL,
    name                 VARCHAR(255)    NOT NULL,
    description          TEXT,
    field_mappings       JSONB           NOT NULL,
    event_type_mapping   JSONB,
    timestamp_field      VARCHAR(255),
    timestamp_format     VARCHAR(50)     DEFAULT 'iso8601',
    source_event_id_field VARCHAR(255),
    validation_schema    JSONB,
    priority             VARCHAR(10)     NOT NULL DEFAULT 'normal',
    is_active            BOOLEAN         NOT NULL DEFAULT true,
    version              INTEGER         NOT NULL DEFAULT 1,
    created_by           VARCHAR(100),
    updated_by           VARCHAR(100),
    created_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Only one active mapping per (source_id, event_type) at a time
CREATE UNIQUE INDEX idx_event_mappings_source_type_active
    ON event_ingestion_service.event_mappings (source_id, event_type)
    WHERE is_active = true;

-- Lookup by source_id
CREATE INDEX idx_event_mappings_source_id
    ON event_ingestion_service.event_mappings (source_id);

-- Filter by active status
CREATE INDEX idx_event_mappings_is_active
    ON event_ingestion_service.event_mappings (is_active);

-- ============================================================================
-- event_sources — Registered source system configurations
-- ============================================================================
CREATE TABLE event_ingestion_service.event_sources (
    id                   SERIAL          PRIMARY KEY,
    name                 VARCHAR(50)     NOT NULL UNIQUE,
    display_name         VARCHAR(100)    NOT NULL,
    type                 VARCHAR(20)     NOT NULL,
    connection_config    JSONB,
    api_key_hash         VARCHAR(128),
    signing_secret_hash  VARCHAR(128),
    is_active            BOOLEAN         NOT NULL DEFAULT true,
    rate_limit           INTEGER,
    created_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- events — All ingested events (raw and normalized)
-- ============================================================================
CREATE TABLE event_ingestion_service.events (
    id                   BIGSERIAL       PRIMARY KEY,
    event_id             UUID            NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    source_id            VARCHAR(50)     NOT NULL,
    cycle_id             VARCHAR(255)    NOT NULL,
    event_type           VARCHAR(100)    NOT NULL,
    source_event_id      VARCHAR(255),
    raw_payload          JSONB           NOT NULL,
    normalized_payload   JSONB,
    status               VARCHAR(20)     NOT NULL DEFAULT 'received',
    error_message        TEXT,
    correlation_id       UUID,
    created_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Deduplication composite key (partial — only rows with a source_event_id)
CREATE UNIQUE INDEX idx_events_source_source_event_id
    ON event_ingestion_service.events (source_id, source_event_id)
    WHERE source_event_id IS NOT NULL;

-- Filter by source and event type
CREATE INDEX idx_events_source_type
    ON event_ingestion_service.events (source_id, event_type);

-- Filter by processing status
CREATE INDEX idx_events_status
    ON event_ingestion_service.events (status);

-- Time-range queries
CREATE INDEX idx_events_created_at
    ON event_ingestion_service.events (created_at);

-- ============================================================================
-- purge_event_payloads() — Scheduled payload purge
--
-- NULLs out raw_payload & normalized_payload on rows older than
-- p_older_than_days (default 90). Event metadata is retained.
--
-- Designed to be called by pg_cron, an application scheduler, or manually:
--   SELECT event_ingestion_service.purge_event_payloads();
--   SELECT event_ingestion_service.purge_event_payloads(60);
-- ============================================================================
CREATE OR REPLACE FUNCTION event_ingestion_service.purge_event_payloads(
    p_older_than_days  INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_purged  BIGINT;
    v_cutoff  TIMESTAMPTZ;
BEGIN
    v_cutoff := NOW() - (p_older_than_days || ' days')::INTERVAL;

    UPDATE event_ingestion_service.events
       SET raw_payload        = NULL,
           normalized_payload = NULL,
           updated_at         = NOW()
     WHERE created_at < v_cutoff
       AND (raw_payload IS NOT NULL OR normalized_payload IS NOT NULL);

    GET DIAGNOSTICS v_purged = ROW_COUNT;

    RETURN JSONB_BUILD_OBJECT(
        'purged_rows',  v_purged,
        'cutoff',       v_cutoff,
        'executed_at',  NOW()
    );
END;
$$;
