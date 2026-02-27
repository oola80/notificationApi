# Mailgun Adapter Reference

**adapter-mailgun — Port 3171**

---

## Overview

The Mailgun adapter handles email delivery via Mailgun's v3 REST API. It operates as a stateless dumb pipe — receiving pre-rendered email content from the Channel Router Service via the standardized `POST /send` contract and translating it to Mailgun's multipart/form-data API format.

| Attribute | Value |
|---|---|
| **Provider** | Mailgun |
| **Channels** | Email |
| **Port** | 3171 |
| **SDK/Client** | HTTP REST (no SDK — direct `axios` calls to v3 API) |
| **Auth** | HTTP Basic Auth (`api:${MAILGUN_API_KEY}`) |
| **Estimated LOC** | ~350 |

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `POST https://api.mailgun.net/v3/{domain}/messages` | Send email (US region) |
| `POST https://api.eu.mailgun.net/v3/{domain}/messages` | Send email (EU region) |

### Region Selection

The adapter selects the API base URL based on the `MAILGUN_REGION` environment variable:
- `us` (default): `https://api.mailgun.net`
- `eu`: `https://api.eu.mailgun.net`

---

## Send Mapping

| SendRequest Field | Mailgun API Field | Notes |
|---|---|---|
| `recipient.email` | `to` | Recipient email address |
| `recipient.name` + `recipient.email` | `to` | `"Name <email>"` format if name present |
| `content.subject` | `subject` | Email subject line |
| `content.body` | `html` | Pre-rendered HTML body |
| `metadata.correlationId` | `v:correlationId` | Custom variable (returned in webhooks) |
| `metadata.cycleId` | `v:cycleId` | Custom variable |
| `notificationId` | `v:notificationId` | Custom variable (for receipt correlation) |
| Channel config sender | `from` | `"Sender Name <sender@domain.com>"` |
| `media[].content` (Base64) | `attachment` | Multipart file attachment |
| `media[].filename` | Attachment filename | Used in Content-Disposition |

### Custom Variables

Mailgun custom variables (`v:key`) are included in webhook payloads, enabling correlation between delivery events and the original notification. The adapter always sets:
- `v:notificationId` — for delivery receipt correlation
- `v:correlationId` — for end-to-end tracing
- `v:cycleId` — for business cycle correlation

---

## Webhook Verification

Mailgun webhooks are verified using **HMAC-SHA256** with the Mailgun signing key.

### Verification Algorithm

1. Extract `timestamp`, `token`, and `signature` from the webhook payload's `signature` object
2. Concatenate: `timestamp` + `token`
3. Compute HMAC-SHA256 of the concatenated string using `MAILGUN_WEBHOOK_SIGNING_KEY`
4. Compare the computed hash (hex-encoded) against the received `signature` value
5. Reject if mismatch or if `timestamp` is older than 5 minutes (replay protection)

```
signature_input = timestamp + token
expected = HMAC-SHA256(signature_input, MAILGUN_WEBHOOK_SIGNING_KEY)
valid = (expected === signature.signature) && (now - timestamp < 300s)
```

---

## Webhook Event Types

| Mailgun Event | Mapped Status | Description |
|---|---|---|
| `delivered` | `DELIVERED` | Message accepted by recipient's mail server |
| `opened` | `OPENED` | Recipient opened the email (tracking pixel) |
| `clicked` | `CLICKED` | Recipient clicked a link in the email |
| `failed` (permanent) | `BOUNCED` | Permanent delivery failure (invalid address) |
| `failed` (temporary) | `TEMP_FAIL` | Temporary failure (retry may succeed) |
| `complained` | `SPAM_COMPLAINT` | Recipient marked as spam |
| `unsubscribed` | `UNSUBSCRIBED` | Recipient unsubscribed via List-Unsubscribe |

---

## Error Classification

| HTTP Status | Error Type | Retryable | Notes |
|---|---|---|---|
| 200 | Success | — | Message queued for delivery |
| 400 | Bad Request | No | Invalid parameters (malformed email, missing fields) |
| 401 | Unauthorized | No | Invalid API key |
| 402 | Payment Required | No | Account suspended / billing issue |
| 404 | Not Found | No | Invalid domain |
| 413 | Too Large | No | Attachment exceeds limit |
| 429 | Rate Limited | Yes | Too many requests — respect `Retry-After` header |
| 500 | Server Error | Yes | Mailgun internal error |
| 502 | Bad Gateway | Yes | Upstream error |
| 503 | Unavailable | Yes | Service temporarily unavailable |

---

## Provider Message ID

Mailgun returns the message ID in the response body:
```json
{
  "id": "<20230101120000.abc123@domain.com>",
  "message": "Queued. Thank you."
}
```

The adapter extracts the `id` field (angle brackets included) as the `providerMessageId` in `SendResult`.

Mailgun includes this ID as `Message-Id` in webhook payloads for correlation.

---

## Environment Variables

| Variable | Required | Description | Example |
|---|---|---|---|
| `MAILGUN_API_KEY` | Yes | Mailgun API key | `key-abc123...` |
| `MAILGUN_DOMAIN` | Yes | Sending domain | `mg.example.com` |
| `MAILGUN_REGION` | No | API region (`us` or `eu`) | `us` |
| `MAILGUN_FROM_NAME` | No | Default sender name | `Notifications` |
| `MAILGUN_FROM_EMAIL` | No | Default sender email | `noreply@example.com` |
| `MAILGUN_WEBHOOK_SIGNING_KEY` | Yes | HMAC-SHA256 webhook verification key | `key-xyz789...` |
| `MAILGUN_TIMEOUT_MS` | No | HTTP timeout (default 10000) | `10000` |

---

## Auto-Throttling

> **Info:** Unlike some providers with fixed rate limits, Mailgun handles ESP-level throttling and warm-up automatically. The core's token bucket rate limiter for Mailgun can use a relaxed configuration since Mailgun manages delivery pacing internally.

---

*Provider Adapters Documentation — Mailgun Reference — 2026*
