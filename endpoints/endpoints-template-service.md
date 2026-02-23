# Template Service — Endpoint Reference

> **Info:** This file tracks all planned REST API endpoints for the Template Service (port 3153). Update the **Status** column as endpoints are implemented.

## Template Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/templates` | Create a new template with channel variants (email, sms, whatsapp, push) | Not Started |
| GET | `/templates` | List all templates with pagination and filtering (channel, isActive, search by name/slug) | Not Started |
| GET | `/templates/:id` | Retrieve full template details including all channel variants, variables, and version history | Not Started |
| PUT | `/templates/:id` | Update a template; creates a new immutable version (requires changeSummary) | Not Started |
| POST | `/templates/:id/render` | Render a template with provided variable data for a specific channel | Not Started |
| POST | `/templates/:id/preview` | Preview a template with sample data across all channels; returns rendered previews | Not Started |

## Health

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Health check (database, RabbitMQ, cache status) | Not Started |
