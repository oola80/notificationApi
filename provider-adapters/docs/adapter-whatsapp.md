# WhatsApp Adapter Reference

**adapter-whatsapp — Port 3173**

---

## Overview

The WhatsApp adapter handles WhatsApp message delivery via Meta's Cloud API (v21.0). It supports text messages, template messages (required for business-initiated conversations outside the 24-hour window), and media messages. This adapter provides native WhatsApp integration as an alternative to Braze's WhatsApp channel.

| Attribute | Value |
|---|---|
| **Provider** | WhatsApp (Meta Cloud API) |
| **Channels** | WhatsApp |
| **Port** | 3173 |
| **SDK/Client** | HTTP REST (`axios` calls to Graph API v21.0) |
| **Auth** | System User Token (`Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}`) |
| **Estimated LOC** | ~400 |

---

## WhatsApp Routing Rule

> **Warning:** **Mutual Exclusion:** Both adapter-whatsapp (this adapter) and adapter-braze support WhatsApp delivery. Only one can be active for the WhatsApp channel at a time. This is enforced via the `isActive` flag on the provider registration in channel-router-service. When registering both providers for WhatsApp, set `isActive: true` on only one.

---

## API Endpoint

| Endpoint | Description |
|---|---|
| `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages` | Send WhatsApp message |

---

## Message Types

### Text Message
For messages within the 24-hour conversation window:

| SendRequest Field | WhatsApp API Field | Notes |
|---|---|---|
| `recipient.phone` | `to` | E.164 format without leading `+` (e.g., `971501234567`) |
| `content.body` | `text.body` | Plain text message body |
| — | `messaging_product` | Always `"whatsapp"` |
| — | `type` | `"text"` |

### Template Message
For business-initiated conversations outside the 24-hour window:

| SendRequest Field | WhatsApp API Field | Notes |
|---|---|---|
| `recipient.phone` | `to` | E.164 format without `+` |
| `metadata.eventType` | `template.name` | Template name (must be pre-approved by Meta) |
| `content.body` | `template.components[].parameters` | Variable substitution values |
| — | `template.language.code` | From `WHATSAPP_TEMPLATE_LANGUAGE` (default `en`) |

> **Note:** WhatsApp template messages must be pre-approved by Meta before use. The adapter maps the `eventType` to a pre-configured template name mapping.

### Media Messages

| Type | WhatsApp API Field | Source |
|---|---|---|
| Image | `image.link` | `media[].url` (URL passthrough) |
| Document | `document.link` + `document.filename` | `media[].url` + `media[].filename` |
| Video | `video.link` | `media[].url` |

---

## 24-Hour Conversation Window

WhatsApp enforces a 24-hour conversation window:
- **User-initiated:** After a user messages the business, the business can send free-form messages for 24 hours
- **Business-initiated:** Outside the 24-hour window, only pre-approved template messages are allowed
- The adapter determines message type based on `content.subject`:
  - If `content.subject` starts with `template:` → send as template message
  - Otherwise → send as text/media message (assumes active conversation window)

---

## Phone Number Formatting

WhatsApp requires E.164 format **without** the leading `+`:
- Input: `+971501234567` → Formatted: `971501234567`
- Input: `971501234567` → Formatted: `971501234567` (no change)
- The adapter strips any leading `+` from `recipient.phone`

---

## Webhook Verification

WhatsApp webhooks use a two-step process:

### 1. Webhook Registration (GET Challenge)
Meta sends a GET request to verify the webhook URL:

```
GET /webhooks/inbound?hub.mode=subscribe&hub.challenge=CHALLENGE_STRING&hub.verify_token=VERIFY_TOKEN
```

The adapter responds with the `hub.challenge` value if `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN`.

### 2. Event Notifications (POST with X-Hub-Signature-256)
Event payloads are verified using HMAC-SHA256:

1. Read the raw request body
2. Compute HMAC-SHA256 of the body using `WHATSAPP_APP_SECRET`
3. Compare with the `X-Hub-Signature-256` header value (format: `sha256=<hex>`)
4. Reject if mismatch

---

## Webhook Event Types

| WhatsApp Status | Mapped Status | Description |
|---|---|---|
| `sent` | `SENT` | Message sent to WhatsApp servers |
| `delivered` | `DELIVERED` | Message delivered to recipient device |
| `read` | `READ` | Recipient read the message |
| `failed` | `BOUNCED` | Delivery failed (check error code) |

### Common Meta Error Codes

| Code | Description | Retryable |
|---|---|---|
| 130429 | Rate limit hit | Yes |
| 131026 | Message undeliverable (number not on WhatsApp) | No |
| 131047 | Re-engagement message (24h window expired) | No |
| 131051 | Unsupported message type | No |
| 132000 | Template not found or not approved | No |
| 132012 | Template parameter count mismatch | No |
| 135000 | Generic error | Yes |
| 368 | Temporarily blocked for policy violations | No |

---

## Error Classification

| HTTP Status | Error Type | Retryable | Notes |
|---|---|---|---|
| 200 | Success | — | Message accepted |
| 400 | Bad Request | No | Invalid parameters, bad phone format |
| 401 | Unauthorized | No | Invalid or expired access token |
| 429 | Rate Limited | Yes | Rate limit exceeded |
| 500 | Server Error | Yes | Meta internal error |
| 503 | Unavailable | Yes | Service temporarily unavailable |

---

## Provider Message ID

WhatsApp returns the message ID in the response:
```json
{
  "messaging_product": "whatsapp",
  "contacts": [{ "input": "971501234567", "wa_id": "971501234567" }],
  "messages": [{ "id": "wamid.abc123..." }]
}
```

The adapter extracts `messages[0].id` (the `wamid.xxx` value) as the `providerMessageId`.

---

## Environment Variables

| Variable | Required | Description | Example |
|---|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Yes | System user access token | `EAABx...` |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | WhatsApp Business phone number ID | `123456789012345` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Yes | WhatsApp Business Account ID | `987654321098765` |
| `WHATSAPP_APP_SECRET` | Yes | App secret for webhook signature verification | `abc123...` |
| `WHATSAPP_VERIFY_TOKEN` | Yes | Token for webhook URL verification (GET challenge) | `my-verify-token` |
| `WHATSAPP_TEMPLATE_LANGUAGE` | No | Default template language (default `en`) | `en` |
| `WHATSAPP_API_VERSION` | No | Graph API version (default `v21.0`) | `v21.0` |
| `WHATSAPP_TIMEOUT_MS` | No | HTTP timeout (default 10000) | `10000` |
| `WHATSAPP_TEST_MODE` | No | When `true`, all messages use the static `hello_world` test template (default `false`) | `true` |

---

## Test Mode

When `WHATSAPP_TEST_MODE=true` is set, the adapter bypasses all dynamic message building logic and sends Meta's built-in `hello_world` test template for every request. This is useful for quick integration testing against the live Meta Cloud API without needing a pre-approved custom template.

**Behavior when active:**

- The `to` phone number from the original request is preserved
- The message payload is replaced with a static template:
  ```json
  {
    "messaging_product": "whatsapp",
    "to": "<original phone number>",
    "type": "template",
    "template": {
      "name": "hello_world",
      "language": { "code": "en_US" }
    }
  }
  ```
- A `WARN`-level log is emitted on every send so the override is clearly visible
- All other adapter functionality (health checks, metrics, error classification) is unaffected

**When to use:**

- Local development: verifying end-to-end connectivity with the Meta Cloud API
- Integration testing: confirming the adapter can authenticate and deliver a message
- Smoke tests: quick validation after deployment

**When NOT to use:**

- Production environments (omit the variable or set to `false`)
- When testing custom template rendering or parameter substitution

> **Warning:** Never enable test mode in production. All outbound messages will be replaced with the `hello_world` template regardless of the original request content.

---

*Provider Adapters Documentation — WhatsApp Reference — 2026*
