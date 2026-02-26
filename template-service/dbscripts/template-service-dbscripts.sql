-- =============================================================================
-- Template Service — Database Objects
-- Schema: template_service
-- =============================================================================
-- This file contains all database object definitions (tables, indexes, functions,
-- triggers, views, etc.) for the template-service.
--
-- IMPORTANT: This file must be updated every time a database change is made to
-- this service. Keep all object definitions here as the single source of truth
-- for the service's database structure (excluding schema/role/user creation,
-- which lives in schema-template-service.sql).
-- =============================================================================

SET search_path TO template_service;

-- ============================================================
-- templates — Master template records
-- ============================================================
CREATE TABLE templates (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            VARCHAR(100)    NOT NULL UNIQUE,
    name            VARCHAR(255)    NOT NULL,
    description     TEXT,
    current_version_id UUID,
    is_active       BOOLEAN         NOT NULL DEFAULT true,
    created_by      VARCHAR(100),
    updated_by      VARCHAR(100),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_templates_slug      ON templates (slug);
CREATE INDEX idx_templates_is_active ON templates (is_active);

-- ============================================================
-- template_versions — Immutable version snapshots
-- ============================================================
CREATE TABLE template_versions (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID            NOT NULL REFERENCES templates(id),
    version_number  INTEGER         NOT NULL,
    change_summary  TEXT,
    created_by      VARCHAR(100),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_template_versions_template_version
        UNIQUE (template_id, version_number)
);

CREATE INDEX idx_template_versions_template_id
    ON template_versions (template_id);

-- Add FK from templates.current_version_id → template_versions.id
-- (deferred because template_versions must exist first)
ALTER TABLE templates
    ADD CONSTRAINT fk_templates_current_version
    FOREIGN KEY (current_version_id) REFERENCES template_versions(id);

-- ============================================================
-- template_channels — Channel-specific content per version
-- ============================================================
CREATE TABLE template_channels (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    template_version_id     UUID            NOT NULL REFERENCES template_versions(id),
    channel                 VARCHAR(20)     NOT NULL,
    subject                 TEXT,
    body                    TEXT            NOT NULL,
    metadata                JSONB           DEFAULT '{}',
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_template_channels_version_channel
        UNIQUE (template_version_id, channel)
);

CREATE INDEX idx_template_channels_version_id
    ON template_channels (template_version_id);

-- ============================================================
-- template_variables — Declared template variables
-- ============================================================
CREATE TABLE template_variables (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID            NOT NULL REFERENCES templates(id),
    variable_name   VARCHAR(100)    NOT NULL,
    description     TEXT,
    default_value   TEXT,
    is_required     BOOLEAN         NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_template_variables_template_name
        UNIQUE (template_id, variable_name)
);

CREATE INDEX idx_template_variables_template_id
    ON template_variables (template_id);
