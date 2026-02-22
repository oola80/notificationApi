-- Create the schema
CREATE SCHEMA IF NOT EXISTS template_service;

-- Create the role
CREATE ROLE template_service_user_role;

-- Create the user with login capability
CREATE USER template_service_user WITH PASSWORD 't3mpl4te2026';

-- Grant the role to the user
GRANT template_service_user_role TO template_service_user;

-- Grant schema usage and creation privileges to the role
GRANT USAGE, CREATE ON SCHEMA template_service TO template_service_user_role;

-- Grant all privileges on all existing tables in the schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA template_service TO template_service_user_role;

-- Grant all privileges on all existing sequences in the schema
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA template_service TO template_service_user_role;

-- Grant all privileges on all existing functions in the schema
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA template_service TO template_service_user_role;

-- Set default privileges for future tables created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA template_service
    GRANT ALL PRIVILEGES ON TABLES TO template_service_user_role;

-- Set default privileges for future sequences created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA template_service
    GRANT ALL PRIVILEGES ON SEQUENCES TO template_service_user_role;

-- Set default privileges for future functions created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA template_service
    GRANT ALL PRIVILEGES ON FUNCTIONS TO template_service_user_role;

-- ============================================================
-- templates — Master template records
-- ============================================================
CREATE TABLE template_service.templates (
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

CREATE INDEX idx_templates_slug      ON template_service.templates (slug);
CREATE INDEX idx_templates_is_active ON template_service.templates (is_active);

-- ============================================================
-- template_versions — Immutable version snapshots
-- ============================================================
CREATE TABLE template_service.template_versions (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID            NOT NULL REFERENCES template_service.templates(id),
    version_number  INTEGER         NOT NULL,
    change_summary  TEXT,
    created_by      VARCHAR(100),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_template_versions_template_version
        UNIQUE (template_id, version_number)
);

CREATE INDEX idx_template_versions_template_id
    ON template_service.template_versions (template_id);

-- Add FK from templates.current_version_id → template_versions.id
-- (deferred because template_versions must exist first)
ALTER TABLE template_service.templates
    ADD CONSTRAINT fk_templates_current_version
    FOREIGN KEY (current_version_id) REFERENCES template_service.template_versions(id);

-- ============================================================
-- template_channels — Channel-specific content per version
-- ============================================================
CREATE TABLE template_service.template_channels (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    template_version_id     UUID            NOT NULL REFERENCES template_service.template_versions(id),
    channel                 VARCHAR(20)     NOT NULL,
    subject                 TEXT,
    body                    TEXT            NOT NULL,
    metadata                JSONB           DEFAULT '{}',
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_template_channels_version_channel
        UNIQUE (template_version_id, channel)
);

CREATE INDEX idx_template_channels_version_id
    ON template_service.template_channels (template_version_id);

-- ============================================================
-- template_variables — Declared template variables
-- ============================================================
CREATE TABLE template_service.template_variables (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID            NOT NULL REFERENCES template_service.templates(id),
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
    ON template_service.template_variables (template_id);
