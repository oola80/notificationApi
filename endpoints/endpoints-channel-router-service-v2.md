# Channel Router Service — Endpoint Reference (v2)

> **Info:** This is v2 of the endpoint reference, updated for the decoupled provider adapter architecture. The v1 reference is at `endpoints-channel-router-service.md`.

> **Info:** This file tracks all planned REST API endpoints for the Channel Router Service (port 3154). Update the **Status** column as endpoints are implemented.

## Provider Webhook Endpoints

Provider webhook endpoints have moved to individual adapter services. The Notification Gateway routes `/webhooks/{provider}` to the appropriate adapter service.

## Adapter Management Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/providers/register` | Register a new provider adapter service (adapter URL, provider ID, channel, rate limit config); triggers capability discovery via `GET /capabilities` | Done |
| DELETE | `/providers/:id` | Deregister a provider adapter service; removes from routing | Done |
| GET | `/providers/:id/capabilities` | Proxy to adapter service's `GET /capabilities` endpoint; returns supported channels, attachment support, limits | Done |
| GET | `/providers/:id/health` | Proxy to adapter service's `GET /health` endpoint; returns provider connectivity status and latency | Done |

## Channel Configuration Endpoints (via Gateway)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/channels` | List all channel configurations with current status, active provider, routing mode, and health indicators | Done |
| PUT | `/channels/:id/config` | Update channel configuration (active provider, routing mode, weights, fallback); validates provider connectivity | Done |
| GET | `/providers` | List all registered provider adapter services with status, supported channels, adapter URL, circuit breaker state, and rate limit config | Done |
| PUT | `/providers/:id/config` | Update provider adapter service configuration (adapter URL, routing weight, rate limits). Note: provider credentials are managed by each adapter service independently, not by the core. | Done |

## Health

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Liveness probe; returns 200 if the service process is running | Done |
| GET | `/ready` | Readiness probe; checks PostgreSQL, RabbitMQ, and at least one adapter service per active channel is healthy (via adapter `GET /health` calls) | Done |
| GET | `/metrics` | Prometheus metrics in text format | Done |
