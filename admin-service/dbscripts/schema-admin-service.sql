-- Create the schema
CREATE SCHEMA IF NOT EXISTS admin_service;

-- Create the role
CREATE ROLE admin_service_user_role;

-- Create the user with login capability
CREATE USER admin_service_user WITH PASSWORD 'adm1ns3rv2026';

-- Grant the role to the user
GRANT admin_service_user_role TO admin_service_user;

-- Grant schema usage and creation privileges to the role
GRANT USAGE, CREATE ON SCHEMA admin_service TO admin_service_user_role;

-- Grant all privileges on all existing tables in the schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA admin_service TO admin_service_user_role;

-- Grant all privileges on all existing sequences in the schema
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA admin_service TO admin_service_user_role;

-- Grant all privileges on all existing functions in the schema
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA admin_service TO admin_service_user_role;

-- Set default privileges for future tables created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA admin_service
    GRANT ALL PRIVILEGES ON TABLES TO admin_service_user_role;

-- Set default privileges for future sequences created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA admin_service
    GRANT ALL PRIVILEGES ON SEQUENCES TO admin_service_user_role;

-- Set default privileges for future functions created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA admin_service
    GRANT ALL PRIVILEGES ON FUNCTIONS TO admin_service_user_role;
