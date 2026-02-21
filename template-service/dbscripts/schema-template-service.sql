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
