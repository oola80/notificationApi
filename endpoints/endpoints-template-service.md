# Template Service — Endpoint Reference

> **Info:** This file tracks all planned REST API endpoints for the Template Service (port 3153). Update the **Status** column as endpoints are implemented.

## Template Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/templates` | Create a new template with channel variants (email, sms, whatsapp, push) | Done |
| GET | `/templates` | List all templates with pagination and filtering (channel, isActive, search by name/slug) | Done |
| GET | `/templates/:id` | Retrieve full template details including all channel variants, variables, and version history | Done |
| PUT | `/templates/:id` | Update a template; creates a new immutable version (requires changeSummary) | Done |
| DELETE | `/templates/:id` | Soft delete a template (sets isActive to false) | Done |
| POST | `/templates/:id/render` | Render a template with provided variable data for a specific channel | Done |
| POST | `/templates/:id/preview` | Preview a template with sample data across all channels; returns rendered previews | Done |
| POST | `/templates/:id/rollback` | Rollback template to a specific version number (updates current_version_id pointer) | Done |

## Health

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Health check (database, RabbitMQ, cache status) | Done |
| GET | `/metrics` | Prometheus metrics (custom ts_ metrics + Node.js defaults) | Done |
