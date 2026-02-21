-- Create the schema
CREATE SCHEMA IF NOT EXISTS notification_gateway;

-- Create the role
CREATE ROLE notification_gateway_user_role;

-- Create the user with login capability
CREATE USER notification_gateway_user WITH PASSWORD 'n0t1f_gw2026';

-- Grant the role to the user
GRANT notification_gateway_user_role TO notification_gateway_user;

-- Grant schema usage and creation privileges to the role
GRANT USAGE, CREATE ON SCHEMA notification_gateway TO notification_gateway_user_role;

-- Grant all privileges on all existing tables in the schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA notification_gateway TO notification_gateway_user_role;

-- Grant all privileges on all existing sequences in the schema
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA notification_gateway TO notification_gateway_user_role;

-- Grant all privileges on all existing functions in the schema
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA notification_gateway TO notification_gateway_user_role;

-- Set default privileges for future tables created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA notification_gateway
    GRANT ALL PRIVILEGES ON TABLES TO notification_gateway_user_role;

-- Set default privileges for future sequences created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA notification_gateway
    GRANT ALL PRIVILEGES ON SEQUENCES TO notification_gateway_user_role;

-- Set default privileges for future functions created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA notification_gateway
    GRANT ALL PRIVILEGES ON FUNCTIONS TO notification_gateway_user_role;
