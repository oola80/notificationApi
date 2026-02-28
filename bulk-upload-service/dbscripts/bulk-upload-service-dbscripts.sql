-- =============================================================================
-- Bulk Upload Service — Database Objects
-- Schema: bulk_upload_service
-- =============================================================================
-- This file contains all database object definitions (tables, indexes, functions,
-- triggers, views, etc.) for the bulk-upload-service.
--
-- IMPORTANT: This file must be updated every time a database change is made to
-- this service. Keep all object definitions here as the single source of truth
-- for the service's database structure (excluding schema/role/user creation,
-- which lives in schema-bulk-upload-service.sql).
-- =============================================================================

SET search_path TO bulk_upload_service;

-- =============================================================================
-- Table: uploads
-- Primary tracking table for file uploads. Each row represents one uploaded
-- XLSX file and its aggregate processing status.
-- =============================================================================
CREATE TABLE IF NOT EXISTS uploads (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name           VARCHAR(255)    NOT NULL,
    file_size           INTEGER         NOT NULL,
    total_rows          INTEGER         NOT NULL,
    total_events        INTEGER,
    processed_rows      INTEGER         NOT NULL DEFAULT 0,
    succeeded_rows      INTEGER         NOT NULL DEFAULT 0,
    failed_rows         INTEGER         NOT NULL DEFAULT 0,
    status              VARCHAR(20)     NOT NULL DEFAULT 'queued',
    uploaded_by         UUID            NOT NULL,
    original_file_path  VARCHAR(500),
    result_file_path    VARCHAR(500),
    result_generated_at TIMESTAMPTZ,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Indexes for uploads
CREATE INDEX IF NOT EXISTS idx_uploads_status
    ON uploads (status);

CREATE INDEX IF NOT EXISTS idx_uploads_uploaded_by
    ON uploads (uploaded_by);

CREATE INDEX IF NOT EXISTS idx_uploads_created_at
    ON uploads (created_at);

CREATE INDEX IF NOT EXISTS idx_uploads_status_created
    ON uploads (status, created_at);

-- =============================================================================
-- Table: upload_rows
-- Per-row tracking for each data row in an uploaded XLSX file. Records the
-- original data, constructed payload, submission outcome, and Event Ingestion
-- response.
-- =============================================================================
CREATE TABLE IF NOT EXISTS upload_rows (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id       UUID            NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    row_number      INTEGER         NOT NULL,
    group_key       VARCHAR(500),
    raw_data        JSONB           NOT NULL,
    mapped_payload  JSONB,
    event_id        UUID,
    status          VARCHAR(20)     NOT NULL DEFAULT 'pending',
    error_message   TEXT,
    processed_at    TIMESTAMPTZ
);

-- Indexes for upload_rows
CREATE INDEX IF NOT EXISTS idx_upload_rows_upload_id
    ON upload_rows (upload_id);

CREATE INDEX IF NOT EXISTS idx_upload_rows_upload_status
    ON upload_rows (upload_id, status);

CREATE INDEX IF NOT EXISTS idx_upload_rows_event_id
    ON upload_rows (event_id)
    WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_upload_rows_group_key
    ON upload_rows (upload_id, group_key)
    WHERE group_key IS NOT NULL;

-- =============================================================================
-- Function: purge_old_uploads()
-- Deletes upload records (and cascading rows via ON DELETE CASCADE) that are
-- in terminal status and older than the specified threshold.
-- =============================================================================
CREATE OR REPLACE FUNCTION purge_old_uploads(
    p_older_than_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM uploads
    WHERE status IN ('completed', 'partial', 'failed', 'cancelled')
      AND created_at < NOW() - (p_older_than_days || ' days')::INTERVAL;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;

-- =============================================================================
-- Trigger: auto-update updated_at on uploads
-- =============================================================================
CREATE OR REPLACE FUNCTION update_uploads_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uploads_updated_at ON uploads;
CREATE TRIGGER trg_uploads_updated_at
    BEFORE UPDATE ON uploads
    FOR EACH ROW
    EXECUTE FUNCTION update_uploads_updated_at();
