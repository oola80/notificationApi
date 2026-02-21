-- Create the schema
CREATE SCHEMA IF NOT EXISTS email_ingest_service;

-- Create the role
CREATE ROLE email_ingest_service_user_role;

-- Create the user with login capability
CREATE USER email_ingest_service_user WITH PASSWORD 'em41l1ng2026';

-- Grant the role to the user
GRANT email_ingest_service_user_role TO email_ingest_service_user;

-- Grant schema usage and creation privileges to the role
GRANT USAGE, CREATE ON SCHEMA email_ingest_service TO email_ingest_service_user_role;

-- Grant all privileges on all existing tables in the schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA email_ingest_service TO email_ingest_service_user_role;

-- Grant all privileges on all existing sequences in the schema
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA email_ingest_service TO email_ingest_service_user_role;

-- Grant all privileges on all existing functions in the schema
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA email_ingest_service TO email_ingest_service_user_role;

-- Set default privileges for future tables created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA email_ingest_service
    GRANT ALL PRIVILEGES ON TABLES TO email_ingest_service_user_role;

-- Set default privileges for future sequences created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA email_ingest_service
    GRANT ALL PRIVILEGES ON SEQUENCES TO email_ingest_service_user_role;

-- Set default privileges for future functions created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA email_ingest_service
    GRANT ALL PRIVILEGES ON FUNCTIONS TO email_ingest_service_user_role;
