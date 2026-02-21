-- Create the schema
CREATE SCHEMA IF NOT EXISTS bulk_upload_service;

-- Create the role
CREATE ROLE bulk_upload_service_user_role;

-- Create the user with login capability
CREATE USER bulk_upload_service_user WITH PASSWORD 'bulkupl02026';

-- Grant the role to the user
GRANT bulk_upload_service_user_role TO bulk_upload_service_user;

-- Grant schema usage and creation privileges to the role
GRANT USAGE, CREATE ON SCHEMA bulk_upload_service TO bulk_upload_service_user_role;

-- Grant all privileges on all existing tables in the schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA bulk_upload_service TO bulk_upload_service_user_role;

-- Grant all privileges on all existing sequences in the schema
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA bulk_upload_service TO bulk_upload_service_user_role;

-- Grant all privileges on all existing functions in the schema
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA bulk_upload_service TO bulk_upload_service_user_role;

-- Set default privileges for future tables created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA bulk_upload_service
    GRANT ALL PRIVILEGES ON TABLES TO bulk_upload_service_user_role;

-- Set default privileges for future sequences created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA bulk_upload_service
    GRANT ALL PRIVILEGES ON SEQUENCES TO bulk_upload_service_user_role;

-- Set default privileges for future functions created in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA bulk_upload_service
    GRANT ALL PRIVILEGES ON FUNCTIONS TO bulk_upload_service_user_role;
