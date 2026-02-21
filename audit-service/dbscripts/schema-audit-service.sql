-- Create the schema
CREATE SCHEMA IF NOT EXISTS audit_service;

-- Create the role
CREATE ROLE audit_service_user_role;

-- Create the user with login capability
CREATE USER audit_service_user WITH PASSWORD 'aud1ts3rv2026';

-- Grant the role to the user
GRANT audit_service_user_role TO audit_service_user;

-- Grant schema usage and creation privileges to the role
GRANT USAGE, CREATE ON SCHEMA audit_service TO audit_service_user_role;

-- Grant all privileges on all existing tables in the schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA audit_service TO audit_service_user_role;

-- Grant all privileges on all existing sequences in the schema
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA audit_service TO audit_service_user_role;

-- Grant all privileges on all existing functions in the schema
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA audit_service TO audit_service_user_role;

-- Set default privileges for future tables created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA audit_service
    GRANT ALL PRIVILEGES ON TABLES TO audit_service_user_role;

-- Set default privileges for future sequences created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA audit_service
    GRANT ALL PRIVILEGES ON SEQUENCES TO audit_service_user_role;

-- Set default privileges for future functions created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA audit_service
    GRANT ALL PRIVILEGES ON FUNCTIONS TO audit_service_user_role;
