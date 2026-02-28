-- Create the schema
CREATE SCHEMA IF NOT EXISTS auth_rbac_service_backend;

-- Create the role
CREATE ROLE auth_rbac_service_backend_user_role;

-- Create the user with login capability
CREATE USER auth_rbac_service_backend_user WITH PASSWORD 'authr6ac2026';

-- Grant the role to the user
GRANT auth_rbac_service_backend_user_role TO auth_rbac_service_backend_user;

-- Grant schema usage and creation privileges to the role
GRANT USAGE, CREATE ON SCHEMA auth_rbac_service_backend TO auth_rbac_service_backend_user_role;

-- Grant all privileges on all existing tables in the schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth_rbac_service_backend TO auth_rbac_service_backend_user_role;

-- Grant all privileges on all existing sequences in the schema
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth_rbac_service_backend TO auth_rbac_service_backend_user_role;

-- Grant all privileges on all existing functions in the schema
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA auth_rbac_service_backend TO auth_rbac_service_backend_user_role;

-- Set default privileges for future tables created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA auth_rbac_service_backend
    GRANT ALL PRIVILEGES ON TABLES TO auth_rbac_service_backend_user_role;

-- Set default privileges for future sequences created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA auth_rbac_service_backend
    GRANT ALL PRIVILEGES ON SEQUENCES TO auth_rbac_service_backend_user_role;

-- Set default privileges for future functions created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA auth_rbac_service_backend
    GRANT ALL PRIVILEGES ON FUNCTIONS TO auth_rbac_service_backend_user_role;
