# Bulk Upload Service — Endpoint Reference

> **Info:** This file tracks all planned REST API endpoints for the Bulk Upload Service (port 3158). Update the **Status** column as endpoints are implemented.

## Upload Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/uploads` | Upload an XLSX file for bulk event submission (multipart/form-data, max 10 MB, max 5,000 rows) | Done |
| GET | `/uploads` | List all uploads with pagination and filters (status, uploadedBy, dateFrom, dateTo) | Done |
| GET | `/uploads/:id` | Get detailed information for a specific upload including file metadata, progress counters, and timing | Done |
| GET | `/uploads/:id/status` | Check the processing status of a specific upload (designed for polling) | Done |
| GET | `/uploads/:id/result` | Download the result XLSX file with all original columns plus _notification_status column | Done |
| GET | `/uploads/:id/errors` | Get failed row details for a specific upload (paginated, with original row data and error message) | Done |
| POST | `/uploads/:id/retry` | Retry all failed rows for a specific upload (requires Admin role; upload must be partial or failed) | Done |
| DELETE | `/uploads/:id` | Cancel an in-progress upload or delete a completed upload record (requires Admin role) | Done |

## Metrics

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/metrics` | Prometheus metrics endpoint (text/plain format) | Done |

## Health

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Liveness check (database connectivity only) | Done |
| GET | `/ready` | Readiness check (database + RabbitMQ + Event Ingestion Service + disk space) | Done |
