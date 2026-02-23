# Event Ingestion Service — Endpoint Reference

> **Info:** This file tracks all planned REST API endpoints for the Event Ingestion Service (port 3151). Update the **Status** column as endpoints are implemented.

## Webhook Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/webhooks/events` | Receive webhook events from external integrations; validates, normalizes using runtime mapping configuration, and publishes the event asynchronously | Done |

## Event Query Endpoints (Internal)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/events/:eventId` | Retrieve a single event by its canonical eventId (full event record including raw and normalized payload) | Done |
| GET | `/events` | List/filter events with pagination (filters: sourceId, eventType, status, date range) | Done |

## Event Mapping CRUD Endpoints (Exposed via Admin Service :3155)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/event-mappings` | List mappings (filter by sourceId, eventType, isActive) | Done |
| POST | `/api/v1/event-mappings` | Create a new mapping configuration | Done |
| GET | `/api/v1/event-mappings/:id` | Get mapping detail by ID | Done |
| PUT | `/api/v1/event-mappings/:id` | Update a mapping configuration | Done |
| DELETE | `/api/v1/event-mappings/:id` | Soft-delete a mapping configuration | Done |
| POST | `/api/v1/event-mappings/:id/test` | Test a mapping with a sample payload (returns canonical event without persisting or publishing) | Done |

## Observability

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/metrics` | Prometheus metrics endpoint; returns all registered counters, histograms, and gauges in text/plain format | Done |

## Health

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Health check; returns service status, database connectivity, RabbitMQ connection health, and consumer queue depths | Done |
