# Channel Router Service — Endpoint Reference

> **Info:** This file tracks all planned REST API endpoints for the Channel Router Service (port 3154). Update the **Status** column as endpoints are implemented.

## Provider Webhook Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/webhooks/sendgrid` | Receives SendGrid delivery event webhooks; verifies ECDSA signature; maps events to internal statuses | Not Started |
| POST | `/webhooks/mailgun` | Receives Mailgun delivery event webhooks; verifies HMAC-SHA256 signature; maps to internal status | Not Started |
| POST | `/webhooks/twilio` | Receives Twilio SMS/WhatsApp status callbacks; validates using Twilio Request Validator | Not Started |
| POST | `/webhooks/braze` | Receives Braze transactional email postbacks; verifies API key header; maps to internal status | Not Started |

## Channel Configuration Endpoints (via Gateway)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/channels` | List all channel configurations with current status, active provider, routing mode, and health indicators | Not Started |
| PUT | `/channels/:id/config` | Update channel configuration (active provider, routing mode, weights, fallback); validates provider connectivity | Not Started |
| GET | `/providers` | List all configured providers with status, supported channels, and circuit breaker state | Not Started |
| PUT | `/providers/:id/config` | Update provider credentials and settings (sensitive values encrypted at rest) | Not Started |

## Health

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Liveness probe; returns 200 if the service process is running | Not Started |
| GET | `/ready` | Readiness probe; checks PostgreSQL, RabbitMQ, and at least one provider per active channel is healthy | Not Started |
