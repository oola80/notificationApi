-- =============================================================================
-- Auth RBAC Service Backend — Database Objects
-- Schema: auth_rbac_service_backend
-- =============================================================================
-- This file contains all database object definitions (tables, indexes, functions,
-- triggers, views, etc.) for the auth-rbac-service-backend.
--
-- IMPORTANT: This file must be updated every time a database change is made to
-- this service. Keep all object definitions here as the single source of truth
-- for the service's database structure (excluding schema/role/user creation,
-- which lives in schema-auth-rbac-service-backend.sql).
-- =============================================================================

SET search_path TO auth_rbac_service_backend;

-- =============================================================================
-- Table: applications
-- Registered applications that users can access.
-- =============================================================================
CREATE TABLE IF NOT EXISTS applications (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100)    NOT NULL,
    code            VARCHAR(50)     NOT NULL,
    description     TEXT,
    frontend_url    VARCHAR(500)    NOT NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_applications_name UNIQUE (name),
    CONSTRAINT uq_applications_code UNIQUE (code)
);

-- =============================================================================
-- Table: users
-- User accounts with authentication state.
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    email                   VARCHAR(255)    NOT NULL,
    password_hash           VARCHAR(255)    NOT NULL,
    full_name               VARCHAR(200)    NOT NULL,
    status                  VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE',
    failed_login_attempts   INTEGER         NOT NULL DEFAULT 0,
    locked_until            TIMESTAMPTZ,
    password_changed_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_login_at           TIMESTAMPTZ,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by              UUID,

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'LOCKED', 'DEACTIVATED'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- =============================================================================
-- Table: roles
-- Roles defined per application with hierarchy levels.
-- =============================================================================
CREATE TABLE IF NOT EXISTS roles (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  UUID            NOT NULL REFERENCES applications(id),
    name            VARCHAR(100)    NOT NULL,
    description     TEXT,
    level           INTEGER         NOT NULL DEFAULT 100,
    is_system       BOOLEAN         NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_roles_application_name UNIQUE (application_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_application_id ON roles (application_id);

-- =============================================================================
-- Table: permissions
-- Granular permissions per application as resource + action pairs.
-- =============================================================================
CREATE TABLE IF NOT EXISTS permissions (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  UUID            NOT NULL REFERENCES applications(id),
    resource        VARCHAR(100)    NOT NULL,
    action          VARCHAR(50)     NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_permissions_application_resource_action UNIQUE (application_id, resource, action)
);

CREATE INDEX IF NOT EXISTS idx_permissions_application_id ON permissions (application_id);

-- =============================================================================
-- Table: role_permissions
-- Many-to-many mapping between roles and permissions.
-- =============================================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id         UUID            NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   UUID            NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,

    PRIMARY KEY (role_id, permission_id)
);

-- =============================================================================
-- Table: user_applications
-- Grants users access to specific applications.
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_applications (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    application_id  UUID            NOT NULL REFERENCES applications(id),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_applications_user_app UNIQUE (user_id, application_id)
);

CREATE INDEX IF NOT EXISTS idx_user_applications_user_id ON user_applications (user_id);
CREATE INDEX IF NOT EXISTS idx_user_applications_application_id ON user_applications (application_id);

-- =============================================================================
-- Table: user_application_roles
-- Role assignments for a user within a specific application.
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_application_roles (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_application_id     UUID            NOT NULL REFERENCES user_applications(id) ON DELETE CASCADE,
    role_id                 UUID            NOT NULL REFERENCES roles(id),
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_app_roles_ua_role UNIQUE (user_application_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_app_roles_user_application_id ON user_application_roles (user_application_id);

-- =============================================================================
-- Table: refresh_tokens
-- Refresh token tracking with rotation and replay detection.
-- =============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255)    NOT NULL,
    expires_at      TIMESTAMPTZ     NOT NULL,
    is_revoked      BOOLEAN         NOT NULL DEFAULT false,
    replaced_by_id  UUID            REFERENCES refresh_tokens(id),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active ON refresh_tokens (expires_at) WHERE is_revoked = false;

-- =============================================================================
-- Table: password_history
-- Stores hashed previous passwords to prevent reuse.
-- =============================================================================
CREATE TABLE IF NOT EXISTS password_history (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash   VARCHAR(255)    NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON password_history (user_id);

-- =============================================================================
-- Function: purge_expired_refresh_tokens
-- Removes expired and revoked refresh tokens older than a configurable threshold.
-- =============================================================================
CREATE OR REPLACE FUNCTION purge_expired_refresh_tokens(
    p_older_than_days INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM refresh_tokens
    WHERE (is_revoked = true OR expires_at < NOW())
      AND created_at < NOW() - (p_older_than_days || ' days')::INTERVAL;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;
