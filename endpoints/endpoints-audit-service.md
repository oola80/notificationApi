# Audit Service — Endpoint Reference

> **Info:** This file tracks all planned REST API endpoints for the Audit Service (port 3156). Update the **Status** column as endpoints are implemented.

## Trace Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/audit/trace/:notificationId` | Returns the complete end-to-end notification lifecycle timeline | Done |
| GET | `/audit/trace/correlation/:correlationId` | Returns merged timelines for all notifications sharing a correlation ID | Done |
| GET | `/audit/trace/cycle/:cycleId` | Returns merged timelines for all notifications within a business cycle | Done |

## Log Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/audit/logs` | Returns paginated audit event log entries with filtering and full-text search | Done |
| GET | `/audit/logs/export` | Generates and downloads a styled XLSX file with audit logs joined with delivery receipts | Done |
| GET | `/audit/search` | Full-text search across audit events using tsvector/tsquery | Done |

## Receipt Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/audit/receipts/:notificationId` | Returns all delivery receipts for a notification | Done |

## Analytics Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/audit/analytics` | Returns pre-aggregated analytics data (hourly/daily) with channel and event type filters | Done |
| GET | `/audit/analytics/summary` | Returns high-level summary for dashboard consumption (today, last 7 days, channel breakdown) | Done |
| POST | `/audit/analytics/aggregate` | Manually triggers analytics aggregation (hourly, daily, or both) | Done |

## DLQ Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/audit/dlq` | Returns paginated DLQ entries with filtering by status, queue, and time range | Done |
| PATCH | `/audit/dlq/:id` | Updates a DLQ entry status for investigation tracking | Done |
| POST | `/audit/dlq/:id/reprocess` | Resubmits a DLQ entry to its original exchange/routing key for reprocessing | Done |

## Health

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Basic liveness check | Done |
| GET | `/health/ready` | Readiness check verifying database and RabbitMQ connectivity | Done |
