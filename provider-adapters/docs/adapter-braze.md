# Braze Adapter Reference

**adapter-braze — Port 3172**

---

## Overview

The Braze adapter handles multi-channel delivery (Email, SMS, WhatsApp, Push) via Braze's `/messages/send` REST API. It operates as a stateless dumb pipe with an optional profile sync module for external ID resolution. Braze is the only adapter supporting all four notification channels from a single integration.

| Attribute | Value |
|---|---|
| **Provider** | Braze |
| **Channels** | Email, SMS, WhatsApp, Push |
| **Port** | 3172 |
| **SDK/Client** | HTTP REST (`axios` calls to Braze REST API) |
| **Auth** | Bearer token (`Authorization: Bearer ${BRAZE_API_KEY}`) |
| **Estimated LOC** | ~500 |

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `POST {BRAZE_REST_ENDPOINT}/messages/send` | Send notification (all channels) |
| `POST {BRAZE_REST_ENDPOINT}/users/track` | Sync user attributes/profile |
| `GET {BRAZE_REST_ENDPOINT}/subscription/status/get` | Check subscription group status |

### Braze REST Endpoint

The base URL is region-specific (e.g., `https://rest.iad-01.braze.com`, `https://rest.iad-03.braze.com`). Set via `BRAZE_REST_ENDPOINT` environment variable.

---

## Send Mapping — Email

| SendRequest Field | Braze API Field | Notes |
|---|---|---|
| `recipient.customerId` | `external_ids[0]` | Braze external ID (required for all channels) |
| `content.subject` | `messages.email.subject` | Email subject |
| `content.body` | `messages.email.body` | Pre-rendered HTML body |
| `recipient.email` | `messages.email.from` (reply-to) | Or use `BRAZE_FROM_EMAIL` default |
| `media[].url` | `messages.email.attachments[].url` | Attachment URL |
| `media[].filename` | `messages.email.attachments[].file_name` | Attachment filename |

## Send Mapping — SMS

| SendRequest Field | Braze API Field | Notes |
|---|---|---|
| `recipient.customerId` | `external_ids[0]` | Braze external ID |
| `content.body` | `messages.sms.body` | Plain text SMS body |
| `metadata.correlationId` | `messages.sms.app_id` | For correlation via Currents |
| — | `messages.sms.subscription_group_id` | From `BRAZE_SMS_SUBSCRIPTION_GROUP` |

## Send Mapping — WhatsApp

| SendRequest Field | Braze API Field | Notes |
|---|---|---|
| `recipient.customerId` | `external_ids[0]` | Braze external ID |
| `content.body` | `messages.whatsapp.text` | WhatsApp message text |
| `media[].url` | `messages.whatsapp.media.url` | Media attachment URL |
| — | `messages.whatsapp.subscription_group_id` | From `BRAZE_WHATSAPP_SUBSCRIPTION_GROUP` |

## Send Mapping — Push

| SendRequest Field | Braze API Field | Notes |
|---|---|---|
| `recipient.customerId` | `external_ids[0]` | Braze external ID |
| `content.subject` | `messages.apple_push.alert.title` / `messages.android_push.title` | Push title |
| `content.body` | `messages.apple_push.alert.body` / `messages.android_push.alert` | Push body |
| `media[].url` | `messages.apple_push.mutable_content` + `messages.apple_push.media_url` | iOS rich push |

---

## Profile Sync Module

Braze requires an `external_id` to send messages. The adapter includes a profile sync module that ensures user profiles exist before sending.

### Flow
1. Check LRU cache for `customerId` → `external_id` mapping
2. If miss: call `POST /users/track` with `{ attributes: [{ external_id, email, phone }] }`
3. Cache the mapping (TTL configurable via `BRAZE_PROFILE_CACHE_TTL_SECONDS`, default 3600)
4. Proceed with send

> **Note:** Profile sync is optional. If `BRAZE_PROFILE_SYNC_ENABLED=false`, the adapter assumes `customerId` IS the Braze `external_id`.

---

## Subscription Groups

Braze uses subscription groups to manage opt-in/opt-out per channel. The adapter sets the subscription group ID from environment variables:
- SMS: `BRAZE_SMS_SUBSCRIPTION_GROUP`
- WhatsApp: `BRAZE_WHATSAPP_SUBSCRIPTION_GROUP`

---

## Webhook Events — Transactional Postbacks vs Currents

Braze provides two webhook mechanisms:

| Mechanism | Latency | Channels | Use Case |
|---|---|---|---|
| **Transactional Postbacks** | Real-time (~seconds) | Email only | Immediate delivery status for transactional emails |
| **Currents** | Batched (~5 minutes) | All channels | Comprehensive event streaming (all engagement events) |

The adapter handles both:
- **Transactional postbacks** arrive at `POST /webhooks/inbound` as individual JSON events
- **Currents** events arrive as batched JSON payloads (multiple events per request)

### Webhook Event Types

| Braze Event | Mapped Status | Source | Description |
|---|---|---|---|
| `users.messages.email.Delivery` | `DELIVERED` | Postback/Currents | Email delivered to inbox |
| `users.messages.email.Open` | `OPENED` | Currents | Email opened |
| `users.messages.email.Click` | `CLICKED` | Currents | Link clicked |
| `users.messages.email.Bounce` | `BOUNCED` | Postback/Currents | Hard bounce |
| `users.messages.email.SoftBounce` | `TEMP_FAIL` | Postback | Soft bounce (may retry) |
| `users.messages.email.SpamReport` | `SPAM_COMPLAINT` | Currents | Marked as spam |
| `users.messages.email.Unsubscribe` | `UNSUBSCRIBED` | Currents | Unsubscribed |
| `users.messages.sms.Delivery` | `DELIVERED` | Currents | SMS delivered |
| `users.messages.sms.Rejection` | `BOUNCED` | Currents | SMS rejected by carrier |
| `users.messages.whatsapp.Read` | `READ` | Currents | WhatsApp message read |
| `users.messages.whatsapp.Delivery` | `DELIVERED` | Currents | WhatsApp delivered |
| `users.messages.whatsapp.Failure` | `BOUNCED` | Currents | WhatsApp delivery failed |

---

## Webhook Verification

Braze webhook verification depends on the mechanism:
- **Transactional postbacks:** Verified via shared secret header (`X-Braze-Webhook-Key` matching `BRAZE_WEBHOOK_KEY`)
- **Currents:** Currents connector verification is configured in the Braze dashboard (IP allowlisting + shared secret)

---

## Rate Limits

| Limit | Value | Notes |
|---|---|---|
| API rate limit | 250,000 requests/hour | Per workspace |
| `/messages/send` | 250,000 requests/hour | Shared with other API calls |
| `/users/track` | 50,000 requests/minute | Profile sync operations |

---

## Error Classification

| HTTP Status | Error Type | Retryable | Notes |
|---|---|---|---|
| 201 | Success | — | Message sent successfully |
| 400 | Bad Request | No | Invalid parameters or missing `external_id` |
| 401 | Unauthorized | No | Invalid API key |
| 429 | Rate Limited | Yes | Respect `Retry-After` header |
| 500 | Server Error | Yes | Braze internal error |
| 503 | Unavailable | Yes | Service temporarily unavailable |

---

## Provider Message ID

Braze returns a `dispatch_id` in the response:
```json
{
  "dispatch_id": "abc123-def456",
  "errors": [],
  "message": "success"
}
```

The adapter extracts `dispatch_id` as the `providerMessageId` in `SendResult`.

---

## Environment Variables

| Variable | Required | Description | Example |
|---|---|---|---|
| `BRAZE_API_KEY` | Yes | Braze REST API key | `abc123-...` |
| `BRAZE_REST_ENDPOINT` | Yes | Braze REST endpoint URL | `https://rest.iad-01.braze.com` |
| `BRAZE_APP_ID` | Yes | Braze app identifier | `app-id-123` |
| `BRAZE_WEBHOOK_KEY` | Yes | Shared secret for transactional postback verification | `secret-key-...` |
| `BRAZE_SMS_SUBSCRIPTION_GROUP` | No | SMS subscription group ID | `sub-group-sms-123` |
| `BRAZE_WHATSAPP_SUBSCRIPTION_GROUP` | No | WhatsApp subscription group ID | `sub-group-wa-123` |
| `BRAZE_PROFILE_SYNC_ENABLED` | No | Enable profile sync (default `true`) | `true` |
| `BRAZE_PROFILE_CACHE_TTL_SECONDS` | No | Profile cache TTL (default 3600) | `3600` |
| `BRAZE_TIMEOUT_MS` | No | HTTP timeout (default 10000) | `10000` |

> **Info:** **Braze Currents Latency:** Braze Currents batches events every ~5 minutes before streaming. This means SMS, WhatsApp, and push delivery statuses sent via Braze have a ~5 minute delay compared to real-time webhooks from Mailgun or transactional postbacks.

---

*Provider Adapters Documentation — Braze Reference — 2026*
