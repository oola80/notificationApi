# Notification Engine Service — Endpoint Reference

> **Info:** This file tracks all planned REST API endpoints for the Notification Engine Service (port 3152). Update the **Status** column as endpoints are implemented.

## Rule Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/rules` | Create a new notification rule | Done |
| GET | `/rules` | List notification rules with pagination and filtering (eventType, isActive, page, limit) | Done |
| GET | `/rules/:id` | Retrieve full rule details including conditions, actions, suppression config, and recent trigger count | Done |
| PUT | `/rules/:id` | Update an existing rule (supports partial updates; changes are audit-logged) | Done |
| DELETE | `/rules/:id` | Soft-delete a rule (sets is_active = false) | Done |

## Notification Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/notifications` | List notifications with pagination and filtering (status, channel, eventType, ruleId, recipientEmail, date range) | Done |
| GET | `/notifications/:id` | Retrieve full notification details including lifecycle status log, delivery attempts, rendered content, and recipient information | Done |
| GET | `/notifications/:id/timeline` | Retrieve the complete status transition timeline for a notification | Done |
| POST | `/notifications/send` | Manually trigger a notification (bypasses rule engine — directly creates notification with provided template, channels, and recipients) | Done |

## Recipient Group Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/recipient-groups` | List recipient groups with pagination | Done |
| POST | `/recipient-groups` | Create a new recipient group | Done |
| GET | `/recipient-groups/:id` | Get a recipient group by ID with active members | Done |
| PUT | `/recipient-groups/:id` | Update a recipient group (name, description, members) | Done |
| DELETE | `/recipient-groups/:id` | Soft-delete a recipient group (sets isActive=false) | Done |
| GET | `/recipient-groups/:id/members` | List active members for a recipient group | Done |
| POST | `/recipient-groups/:id/members` | Add a single member to a recipient group | Done |
| DELETE | `/recipient-groups/:id/members/:memberId` | Remove (deactivate) a member from a recipient group | Done |

## Customer Preference Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/customer-preferences` | Webhook endpoint for external systems to upsert customer channel preferences (authenticated via X-API-Key) | Done |
| POST | `/customer-preferences/bulk` | Bulk webhook endpoint for upserting multiple customer preferences (max 1000 per request, authenticated via X-API-Key) | Done |

## Critical Channel Override Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/critical-channel-overrides` | List all critical channel overrides with pagination (filter by eventType, isActive) | Done |
| POST | `/critical-channel-overrides` | Create a new critical channel override | Done |
| GET | `/critical-channel-overrides/:id` | Retrieve a specific critical channel override by ID | Done |
| PUT | `/critical-channel-overrides/:id` | Update an existing critical channel override (supports partial updates, audit-logged) | Done |
| DELETE | `/critical-channel-overrides/:id` | Soft-delete a critical channel override (sets is_active = false) | Done |

## Health & Observability

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Health check (database, RabbitMQ, template service, queue depths, rule cache status) | Done |
| GET | `/metrics` | Prometheus metrics endpoint (text/plain; version=0.0.4) — 7 counters, 3 histograms, 3 gauges + Node.js default metrics | Done |
