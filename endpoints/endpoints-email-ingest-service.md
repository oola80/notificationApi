# Email Ingest Service — Endpoint Reference

> **Info:** This file tracks all planned REST API endpoints for the Email Ingest Service (port 3157, SMTP port 2525). Update the **Status** column as endpoints are implemented.

## Parsing Rule Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/parsing-rules` | List all email parsing rules; supports filters: isActive, eventType, page, limit | Not Started |
| POST | `/parsing-rules` | Create a new email parsing rule; validates regex patterns before persisting | Not Started |
| PUT | `/parsing-rules/:id` | Update an existing parsing rule; supports partial updates; changes take effect immediately | Not Started |
| DELETE | `/parsing-rules/:id` | Soft-delete a parsing rule (sets isActive to false) | Not Started |

## Processed Email Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/processed-emails` | List processed emails with filters: status, sender, dateFrom, dateTo, page, limit | Not Started |
| GET | `/processed-emails/:id` | Retrieve full details for a processed email including original content, matched rule, extracted fields, and generated event | Not Started |

## Health

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Health check; returns service status, SMTP server health, RabbitMQ connection, and database connectivity | Not Started |
