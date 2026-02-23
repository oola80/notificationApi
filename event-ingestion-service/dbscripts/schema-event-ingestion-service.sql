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
