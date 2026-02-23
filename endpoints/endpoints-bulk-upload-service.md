# Bulk Upload Service — Endpoint Reference

> **Info:** This file tracks all planned REST API endpoints for the Bulk Upload Service (port 3158). Update the **Status** column as endpoints are implemented.

## Upload Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/uploads` | Upload an XLSX file for bulk event submission (multipart/form-data, max 10 MB, max 5,000 rows) | Not Started |
| GET | `/uploads` | List all uploads with pagination and filters (status, uploadedBy, dateFrom, dateTo) | Not Started |
| GET | `/uploads/:id` | Get detailed information for a specific upload including file metadata, progress counters, and timing | Not Started |
| GET | `/uploads/:id/status` | Check the processing status of a specific upload (designed for polling) | Not Started |
| GET | `/uploads/:id/result` | Download the result XLSX file with all original columns plus _notification_status column | Not Started |
| GET | `/uploads/:id/errors` | Get failed row details for a specific upload (paginated, with original row data and error message) | Not Started |
| POST | `/uploads/:id/retry` | Retry all failed rows for a specific upload (requires Admin role; upload must be partial or failed) | Not Started |
| DELETE | `/uploads/:id` | Cancel an in-progress upload or delete a completed upload record (requires Admin role) | Not Started |

## Health

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Health check (database, RabbitMQ, Event Ingestion Service reachability, disk space) | Not Started |
