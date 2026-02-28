# Audit Service — Endpoint Reference

> **Info:** This file tracks all planned REST API endpoints for the Audit Service (port 3156). Update the **Status** column as endpoints are implemented.

## Trace Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/audit/trace/:notificationId` | Returns the complete end-to-end notification lifecycle timeline | Not Started |
| GET | `/audit/trace/correlation/:correlationId` | Returns merged timelines for all notifications sharing a correlation ID | Not Started |
| GET | `/audit/trace/cycle/:cycleId` | Returns merged timelines for all notifications within a business cycle | Not Started |

## Log Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/audit/logs` | Returns paginated audit event log entries with filtering and full-text search | Not Started |
| GET | `/audit/search` | Full-text search across audit events using tsvector/tsquery | Not Started |

## Receipt Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/audit/receipts/:notificationId` | Returns all delivery receipts for a notification | Not Started |

## Analytics Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/audit/analytics` | Returns pre-aggregated analytics data (hourly/daily) with channel and event type filters | Not Started |
| GET | `/audit/analytics/summary` | Returns high-level summary for dashboard consumption (today, last 7 days, channel breakdown) | Not Started |

## DLQ Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/audit/dlq` | Returns paginated DLQ entries with filtering by status, queue, and time range | Not Started |
| PATCH | `/audit/dlq/:id` | Updates a DLQ entry status for investigation tracking | Not Started |
| POST | `/audit/dlq/:id/reprocess` | Resubmits a DLQ entry to its original exchange/routing key for reprocessing | Not Started |

## Health

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Basic liveness check | Done |
| GET | `/health/ready` | Readiness check verifying database and RabbitMQ connectivity | Done |
