# Notification Engine Service — Endpoint Reference

> **Info:** This file tracks all planned REST API endpoints for the Notification Engine Service (port 3152). Update the **Status** column as endpoints are implemented.

## Rule Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/rules` | Create a new notification rule | Not Started |
| GET | `/rules` | List notification rules with pagination and filtering (eventType, isActive, page, limit) | Not Started |
| GET | `/rules/:id` | Retrieve full rule details including conditions, actions, suppression config, and recent trigger count | Not Started |
| PUT | `/rules/:id` | Update an existing rule (supports partial updates; changes are audit-logged) | Not Started |
| DELETE | `/rules/:id` | Soft-delete a rule (sets is_active = false) | Not Started |

## Notification Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/notifications` | List notifications with pagination and filtering (status, channel, eventType, ruleId, recipientEmail, date range) | Not Started |
| GET | `/notifications/:id` | Retrieve full notification details including lifecycle status log, delivery attempts, rendered content, and recipient information | Not Started |
| GET | `/notifications/:id/timeline` | Retrieve the complete status transition timeline for a notification | Not Started |
| POST | `/notifications/send` | Manually trigger a notification (bypasses rule engine — directly creates notification with provided template, channels, and recipients) | Not Started |

## Recipient Group Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/recipient-groups` | List recipient groups with pagination | Not Started |
| POST | `/recipient-groups` | Create a new recipient group | Not Started |
| PUT | `/recipient-groups/:id` | Update a recipient group (name, description, members) | Not Started |

## Customer Preference Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/customer-preferences` | Webhook endpoint for external systems to upsert customer channel preferences (authenticated via X-API-Key) | Not Started |
| POST | `/customer-preferences/bulk` | Bulk webhook endpoint for upserting multiple customer preferences (max 1000 per request, authenticated via X-API-Key) | Not Started |

## Critical Channel Override Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/critical-channel-overrides` | List all critical channel overrides with pagination (filter by eventType, isActive) | Not Started |
| POST | `/critical-channel-overrides` | Create a new critical channel override | Not Started |
| GET | `/critical-channel-overrides/:id` | Retrieve a specific critical channel override by ID | Not Started |
| PUT | `/critical-channel-overrides/:id` | Update an existing critical channel override (supports partial updates, audit-logged) | Not Started |
| DELETE | `/critical-channel-overrides/:id` | Soft-delete a critical channel override (sets is_active = false) | Not Started |

## Health

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Health check (database, RabbitMQ, template service, queue depths, rule cache status) | Not Started |
