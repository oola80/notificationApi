-- Create the schema
CREATE SCHEMA IF NOT EXISTS bulk_upload_service;

-- Create the role
CREATE ROLE bulk_upload_service_user_role;

-- Create the user with login capability
CREATE USER bulk_upload_service_user WITH PASSWORD 'bulkupl02026';

-- Grant the role to the user
GRANT bulk_upload_service_user_role TO bulk_upload_service_user;

-- Grant schema usage and creation privileges to the role
GRANT USAGE, CREATE ON SCHEMA bulk_upload_service TO bulk_upload_service_user_role;

-- Grant all privileges on all existing tables in the schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA bulk_upload_service TO bulk_upload_service_user_role;

-- Grant all privileges on all existing sequences in the schema
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA bulk_upload_service TO bulk_upload_service_user_role;

-- Grant all privileges on all existing functions in the schema
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA bulk_upload_service TO bulk_upload_service_user_role;

-- Set default privileges for future tables created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA bulk_upload_service
    GRANT ALL PRIVILEGES ON TABLES TO bulk_upload_service_user_role;

-- Set default privileges for future sequences created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA bulk_upload_service
    GRANT ALL PRIVILEGES ON SEQUENCES TO bulk_upload_service_user_role;

-- Set default privileges for future functions created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA bulk_upload_service
    GRANT ALL PRIVILEGES ON FUNCTIONS TO bulk_upload_service_user_role;

-- ============================================================================
-- Table: uploads
-- Primary tracking table for XLSX file uploads and aggregate processing status.
-- ============================================================================
CREATE TABLE bulk_upload_service.uploads (
    id                   UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name            VARCHAR(255)    NOT NULL,
    file_size            INTEGER         NOT NULL,
    total_rows           INTEGER         NOT NULL,
    total_events         INTEGER,
    processed_rows       INTEGER         NOT NULL DEFAULT 0,
    succeeded_rows       INTEGER         NOT NULL DEFAULT 0,
    failed_rows          INTEGER         NOT NULL DEFAULT 0,
    status               VARCHAR(20)     NOT NULL DEFAULT 'queued',
    uploaded_by          UUID            NOT NULL,
    original_file_path   VARCHAR(500),
    result_file_path     VARCHAR(500),
    result_generated_at  TIMESTAMPTZ,
    started_at           TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Worker polling for queued uploads
CREATE INDEX idx_uploads_status
    ON bulk_upload_service.uploads (status);

-- Filter uploads by user
CREATE INDEX idx_uploads_uploaded_by
    ON bulk_upload_service.uploads (uploaded_by);

-- Time-range queries and FIFO ordering
CREATE INDEX idx_uploads_created_at
    ON bulk_upload_service.uploads (created_at);

-- Worker claim query: WHERE status = 'queued' ORDER BY created_at
CREATE INDEX idx_uploads_status_created
    ON bulk_upload_service.uploads (status, created_at);

-- ============================================================================
-- Table: upload_rows
-- Per-row tracking for each data row in an uploaded XLSX file.
-- ============================================================================
CREATE TABLE bulk_upload_service.upload_rows (
    id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id         UUID            NOT NULL REFERENCES bulk_upload_service.uploads(id) ON DELETE CASCADE,
    row_number        INTEGER         NOT NULL,
    group_key         VARCHAR(500),
    raw_data          JSONB           NOT NULL,
    mapped_payload    JSONB,
    event_id          UUID,
    status            VARCHAR(20)     NOT NULL DEFAULT 'pending',
    error_message     TEXT,
    processed_at      TIMESTAMPTZ
);

-- Fast lookup of all rows for an upload
CREATE INDEX idx_upload_rows_upload_id
    ON bulk_upload_service.upload_rows (upload_id);

-- Query failed/pending rows for retry and error listing
CREATE INDEX idx_upload_rows_upload_status
    ON bulk_upload_service.upload_rows (upload_id, status);

-- Trace back from event to upload row (partial index on non-null event_id)
CREATE INDEX idx_upload_rows_event_id
    ON bulk_upload_service.upload_rows (event_id)
    WHERE event_id IS NOT NULL;

-- Group key lookup for multi-item row grouping (partial index on non-null group_key)
CREATE INDEX idx_upload_rows_group_key
    ON bulk_upload_service.upload_rows (upload_id, group_key)
    WHERE group_key IS NOT NULL;

-- ============================================================================
-- Function: purge_old_uploads
-- Removes upload records and cascading rows older than a configurable threshold.
-- Only purges terminal-state uploads (completed, failed, cancelled).
-- Designed for pg_cron or application-level scheduling.
-- ============================================================================
CREATE OR REPLACE FUNCTION bulk_upload_service.purge_old_uploads(
    p_older_than_days INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_cutoff   TIMESTAMPTZ;
    v_uploads  INTEGER;
    v_rows     INTEGER;
BEGIN
    v_cutoff := NOW() - (p_older_than_days || ' days')::INTERVAL;

    -- Count rows that will be cascade-deleted
    SELECT COALESCE(SUM(ur.ct), 0) INTO v_rows
    FROM (
        SELECT COUNT(*) AS ct
        FROM bulk_upload_service.upload_rows ur
        JOIN bulk_upload_service.uploads u ON u.id = ur.upload_id
        WHERE u.created_at < v_cutoff
          AND u.status IN ('completed', 'partial', 'failed', 'cancelled')
    ) ur;

    -- Delete uploads (rows cascade via ON DELETE CASCADE)
    DELETE FROM bulk_upload_service.uploads
    WHERE created_at < v_cutoff
      AND status IN ('completed', 'partial', 'failed', 'cancelled');

    GET DIAGNOSTICS v_uploads = ROW_COUNT;

    RETURN jsonb_build_object(
        'purged_uploads', v_uploads,
        'purged_rows',    v_rows,
        'cutoff',         v_cutoff,
        'executed_at',    NOW()
    );
END;
$$;
