# Provider Adapter Services — Endpoint Reference

> **Info:** This file tracks all planned REST API endpoints for the Provider Adapter Services. Each adapter exposes the same standardized contract. Update the **Status** column as endpoints are implemented.

## Standardized Adapter Contract

All 4 adapters (adapter-mailgun :3171, adapter-braze :3172, adapter-whatsapp :3173, adapter-aws-ses :3174) expose the same endpoints:

| Method | Path | Description | adapter-mailgun | adapter-braze | adapter-whatsapp | adapter-aws-ses |
|--------|------|-------------|-----------------|---------------|------------------|-----------------|
| POST | `/send` | Accept a SendRequest, translate to provider API, return SendResult | Done | Not Started | Not Started | Not Started |
| GET | `/health` | Liveness + provider connectivity check; returns AdapterHealthResponse | Done | Not Started | Not Started | Not Started |
| GET | `/capabilities` | Returns adapter capabilities (channels, attachments, media, recipients); returns AdapterCapabilitiesResponse | Done | Not Started | Not Started | Not Started |
| POST | `/webhooks/inbound` | Receive provider webhook callbacks; verify signature, normalize event, publish to RabbitMQ | Done | Not Started | Not Started | Not Started |
| GET | `/metrics` | Prometheus metrics (send latency, success/error counts, webhook processing) | Done | Not Started | Not Started | Not Started |

## Adapter-Specific Notes

### adapter-mailgun (:3171)

| Endpoint | Notes |
|----------|-------|
| `POST /send` | Translates SendRequest to Mailgun multipart/form-data. Sets custom variables (`v:notificationId`, `v:correlationId`, `v:cycleId`). |
| `POST /webhooks/inbound` | Verifies HMAC-SHA256 signature using Mailgun webhook signing key. Extracts `timestamp`, `token`, `signature` from payload. |
| `GET /capabilities` | Reports: email channel, supports attachments (true), max 25 MB, 1 recipient per request. |

### adapter-braze (:3172)

| Endpoint | Notes |
|----------|-------|
| `POST /send` | Translates SendRequest to Braze `/messages/send` payload. Supports 4 channel message keys (email, SMS, WhatsApp, push). Optional profile sync via `/users/track`. |
| `POST /webhooks/inbound` | Handles both transactional postbacks (real-time, email only) and Currents events (batched ~5 min, all channels). Verifies via `X-Braze-Webhook-Key` shared secret. |
| `GET /capabilities` | Reports: email/sms/whatsapp/push channels, supports media URLs (true), max 25 MB, 1 recipient per request. |

### adapter-whatsapp (:3173)

| Endpoint | Notes |
|----------|-------|
| `POST /send` | Translates SendRequest to Meta Cloud API v21.0 messages endpoint. Supports text, template, and media messages. Strips leading `+` from phone numbers. |
| `GET /webhooks/inbound` | Handles Meta webhook verification challenge (GET with `hub.verify_token`). |
| `POST /webhooks/inbound` | Verifies X-Hub-Signature-256 (HMAC-SHA256 of raw body with app secret). |
| `GET /capabilities` | Reports: whatsapp channel, supports media URLs (true), max 16 MB, 1 recipient per request. |

### adapter-aws-ses (:3174)

| Endpoint | Notes |
|----------|-------|
| `POST /send` | Dual mode: API (`SendEmailCommand` via `@aws-sdk/client-sesv2`) or SMTP relay (Nodemailer). Switches to raw MIME for attachments. Sets email tags for SNS correlation. |
| `POST /webhooks/inbound` | Handles AWS SNS notifications. Auto-confirms subscription requests (`SubscriptionConfirmation`). Verifies X.509 certificate-based signatures for `Notification` messages. |
| `GET /capabilities` | Reports: email channel, supports attachments (true), max 10 MB, 50 recipients per request. |
