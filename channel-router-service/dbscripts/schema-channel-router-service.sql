-- Create the schema
CREATE SCHEMA IF NOT EXISTS channel_router_service;

-- Create the role
CREATE ROLE channel_router_service_user_role;

-- Create the user with login capability
CREATE USER channel_router_service_user WITH PASSWORD 'ch4nr0ut2026';

-- Grant the role to the user
GRANT channel_router_service_user_role TO channel_router_service_user;

-- Grant schema usage and creation privileges to the role
GRANT USAGE, CREATE ON SCHEMA channel_router_service TO channel_router_service_user_role;

-- Grant all privileges on all existing tables in the schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA channel_router_service TO channel_router_service_user_role;

-- Grant all privileges on all existing sequences in the schema
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA channel_router_service TO channel_router_service_user_role;

-- Grant all privileges on all existing functions in the schema
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA channel_router_service TO channel_router_service_user_role;

-- Set default privileges for future tables created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA channel_router_service
    GRANT ALL PRIVILEGES ON TABLES TO channel_router_service_user_role;

-- Set default privileges for future sequences created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA channel_router_service
    GRANT ALL PRIVILEGES ON SEQUENCES TO channel_router_service_user_role;

-- Set default privileges for future functions created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA channel_router_service
    GRANT ALL PRIVILEGES ON FUNCTIONS TO channel_router_service_user_role;
