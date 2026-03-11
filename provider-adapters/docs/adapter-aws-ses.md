# AWS SES Adapter Reference

**adapter-aws-ses — Port 3174**

---

## Overview

The AWS SES adapter handles email delivery via Amazon Simple Email Service (SES) v2. It supports two delivery modes: API mode using the `@aws-sdk/client-sesv2` `SendEmailCommand`, and SMTP relay mode using Nodemailer. The adapter uses IAM authentication (API mode) or SES-generated SMTP credentials (SMTP mode), and optionally AWS SES Configuration Sets for delivery event tracking via SNS notifications.

> **Info:** This project uses **SMTP mode** (`SES_MODE=smtp`) as the default delivery mode. SMTP mode requires only SES-generated SMTP credentials — no IAM access keys or AWS SDK needed. API-mode variables (`SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`) are not required for SMTP mode.

| Attribute | Value |
|---|---|
| **Provider** | AWS SES |
| **Channels** | Email |
| **Port** | 3174 |
| **SDK/Client** | `@aws-sdk/client-sesv2` (API mode) or Nodemailer (SMTP mode) |
| **Active Mode** | **SMTP** (`SES_MODE=smtp`) — Nodemailer with SES SMTP relay |
| **Auth** | SMTP mode: SES-generated SMTP credentials. API mode: IAM credentials or instance role |
| **Estimated LOC** | ~400 |

---

## API Endpoints

### API Mode

| Endpoint | Description |
|---|---|
| `SESv2 SendEmail` (regional) | Send email via `@aws-sdk/client-sesv2` — region set by `SES_REGION` |

The SDK client is initialized with the `SES_REGION` value. There are no user-facing URLs — the SDK resolves the regional endpoint automatically (e.g., `https://email.us-east-1.amazonaws.com`).

### SMTP Mode

| Setting | Value |
|---|---|
| **SMTP Endpoint** | `email-smtp.{region}.amazonaws.com` (e.g., `email-smtp.us-east-1.amazonaws.com`) |
| **TLS** | Required |
| **STARTTLS Ports** | 25, 587, or 2587 |
| **TLS Wrapper Ports** | 465 or 2465 |

> **Warning:** SMTP credentials are **NOT** the same as IAM access keys. SMTP credentials must be generated from the AWS SES console (IAM > Users > Security Credentials > SMTP credentials). The generated username resembles an IAM access key (`AKIA...`) but the password is a derived SMTP-specific value — not the IAM secret key. The `SES_SMTP_USERNAME` and `SES_SMTP_PASSWORD` environment variables must use these SES-generated SMTP credentials.

---

## Delivery Modes

The adapter supports two mutually exclusive modes, selected via `SES_MODE`:

### SMTP Mode (`SES_MODE=smtp`) — Active
Uses Nodemailer with SMTP transport. Connects to `email-smtp.{region}.amazonaws.com` via STARTTLS (ports 25, 587, or 2587) or TLS Wrapper (ports 465 or 2465). **This is the active delivery mode for this project.** SMTP mode only requires SES-generated SMTP credentials (`SES_SMTP_USERNAME` + `SES_SMTP_PASSWORD`) — no IAM access keys or AWS SDK dependency needed.

### API Mode (`SES_MODE=api`)
Uses `@aws-sdk/client-sesv2` `SendEmailCommand` for JSON-based email sending. Requires IAM credentials (`SES_ACCESS_KEY_ID` + `SES_SECRET_ACCESS_KEY`) or an EC2/ECS instance role. Not currently used in this project.

> **Info:** SMTP mode is the chosen delivery mode for this project. It simplifies authentication (SMTP credentials only, no IAM keys) and supports larger message sizes (40 MB vs 10 MB). API mode is available as an alternative if needed in the future.

---

## Send Mapping — API Mode

| SendRequest Field | SES API Field | Notes |
|---|---|---|
| `recipient.email` | `Destination.ToAddresses[0]` | Recipient email |
| `content.subject` | `Content.Simple.Subject.Data` | Email subject (UTF-8) |
| `content.body` | `Content.Simple.Body.Html.Data` | Pre-rendered HTML body |
| Channel config sender | `FromEmailAddress` | `"Name <email>"` format |
| `notificationId` | `EmailTags[{Name:"notificationId"}]` | For SNS event correlation |
| `metadata.correlationId` | `EmailTags[{Name:"correlationId"}]` | Custom tag |
| — | `ConfigurationSetName` | From `SES_CONFIGURATION_SET` |

### Attachments (API Mode)

For emails with attachments, the adapter switches to `Content.Raw.Data` with MIME construction:
1. Build MIME message using `mailcomposer` or equivalent
2. Encode Base64 attachments from `media[].content`
3. Send via `SendRawEmailCommand`

## Send Mapping — SMTP Mode

| SendRequest Field | Nodemailer Field | Notes |
|---|---|---|
| `recipient.email` | `to` | Recipient email |
| `content.subject` | `subject` | Email subject |
| `content.body` | `html` | Pre-rendered HTML body |
| Channel config sender | `from` | Sender address |
| `media[].content` (Base64) | `attachments[].content` | Base64 attachment |
| `media[].filename` | `attachments[].filename` | Attachment filename |
| `media[].mimeType` | `attachments[].contentType` | MIME type |

---

## SNS Notification Handling

AWS SES sends delivery events via SNS (Simple Notification Service) to the adapter's webhook endpoint.

### Subscription Confirmation

When the SNS topic subscription is first created, AWS sends a `SubscriptionConfirmation` message:
1. Adapter receives the SNS message at `POST /webhooks/inbound`
2. Checks `Type` field — if `SubscriptionConfirmation`, auto-confirms by calling the `SubscribeURL`
3. After confirmation, delivery events start flowing

### Signature Verification

SNS messages are verified using X.509 certificate-based signature verification:
1. Extract `SigningCertURL` from the message
2. Download the X.509 certificate (cache it)
3. Verify the certificate is from `sns.{region}.amazonaws.com`
4. Construct the signing string from message fields (`Message`, `MessageId`, `Subject`, `Timestamp`, `TopicArn`, `Type`)
5. Verify the `Signature` (Base64-decoded) against the signing string using the certificate's public key

> **Warning:** Always verify the `SigningCertURL` domain before downloading the certificate. It MUST match `sns.{region}.amazonaws.com` to prevent spoofing.

---

## SNS Event Types

| SES Event Type | Mapped Status | Description |
|---|---|---|
| `Send` | `SENT` | Email accepted by SES |
| `Delivery` | `DELIVERED` | Email delivered to recipient's mail server |
| `Bounce` (Permanent) | `BOUNCED` | Hard bounce — invalid address |
| `Bounce` (Transient) | `TEMP_FAIL` | Soft bounce — may recover |
| `Complaint` | `SPAM_COMPLAINT` | Recipient complained (ISP feedback loop) |
| `Reject` | `REJECTED` | SES rejected the email (virus, policy) |
| `Open` | `OPENED` | Email opened (requires tracking enabled) |
| `Click` | `CLICKED` | Link clicked (requires tracking enabled) |

> **Note:** Open and Click tracking requires the Configuration Set to have tracking options enabled in the SES console.

---

## Sandbox vs Production

| Mode | Behavior | Notes |
|---|---|---|
| **Sandbox** | Can only send to verified email addresses | Default for new SES accounts |
| **Production** | Can send to any address | Requires production access request to AWS |

The adapter works identically in both modes. In sandbox mode, unverified recipient addresses will result in `MessageRejected` errors.

---

## Rate Limits and Sending Quotas

AWS SES enforces two sending limits per account/region:

| Limit | Sandbox Default | Production | Notes |
|---|---|---|---|
| **Sending rate** (emails/second) | 1 | Varies (starts at 14, scales up) | Max sustained send rate per second |
| **Daily sending quota** (emails/24h) | 200 | Varies (starts at 50,000, scales up) | Rolling 24-hour window |

Production limits increase automatically as SES monitors sending patterns and reputation. You can also request limit increases via AWS Support.

### Querying Current Limits

The adapter can query the account's current sending limits via `GetAccount`:
```
{
  "SendQuota": {
    "Max24HourSend": 50000,
    "MaxSendRate": 14,
    "SentLast24Hours": 1234
  }
}
```

> **Info:** The channel-router-service's token bucket rate limiter for AWS SES should be configured to respect the account's `MaxSendRate`. Unlike Mailgun which handles pacing internally, SES returns `ThrottlingException` or `LimitExceeded` errors when the rate is exceeded.

---

## Message Size Limits

| Mode | Max Message Size | Notes |
|---|---|---|
| **API mode** | 10 MB | Total `SendEmail` request size including attachments |
| **SMTP mode** | 40 MB | Total raw MIME message size |

> **Note:** These limits include headers, body, and all attachments (Base64-encoded). Base64 encoding increases attachment size by ~33%, so the effective attachment file size limit is ~7.5 MB (API) or ~30 MB (SMTP).

---

## Error Codes

The adapter uses the `SES-` prefix for adapter-specific error codes, inheriting the `PA-` base codes from `libs/common`.

| Code | Status | Details | Description |
|---|---|---|---|
| `SES-001` | 400 | `INVALID_REQUEST_BODY` | The request body is invalid |
| `SES-002` | 503 | `SES_API_UNAVAILABLE` | The AWS SES API is unavailable |
| `SES-003` | 502 | `SEND_FAILED` | Failed to send email via AWS SES |
| `SES-004` | 401 | `AUTHENTICATION_FAILED` | IAM credentials are invalid or expired |
| `SES-005` | 400 | `DOMAIN_NOT_VERIFIED` | Sending domain or email address not verified in SES |
| `SES-006` | 429 | `RATE_LIMIT_EXCEEDED` | SES sending rate or daily quota exceeded |
| `SES-007` | 400 | `MESSAGE_REJECTED` | SES rejected the email (content policy, virus, or sandbox restriction) |
| `SES-008` | 403 | `ACCOUNT_SENDING_PAUSED` | SES account sending is paused due to reputation issues |
| `SES-009` | 401 | `WEBHOOK_VERIFICATION_FAILED` | SNS signature verification failed |
| `SES-010` | 400 | `INVALID_RECIPIENT` | The recipient email address is invalid or unverified (sandbox) |

---

## Error Classification

| HTTP Status / Error | Error Type | Retryable | Mapped Code | Notes |
|---|---|---|---|---|
| Success | Success | — | — | Email queued |
| `MessageRejected` | Rejected | No | `SES-007` | Content policy violation or sandbox restriction |
| `MailFromDomainNotVerified` | Config Error | No | `SES-005` | Sending domain not verified |
| `AccountSendingPaused` | Account Error | No | `SES-008` | Sending paused (reputation issue) |
| `LimitExceeded` | Rate Limited | Yes | `SES-006` | Sending rate exceeded |
| `ThrottlingException` | Rate Limited | Yes | `SES-006` | API rate limit |
| `ServiceUnavailableException` | Server Error | Yes | `SES-002` | Temporary SES issue |
| `InternalFailure` | Server Error | Yes | `SES-003` | SES internal error |

---

## Provider Message ID

SES returns the message ID in the API response:
```json
{
  "MessageId": "0102018abc123-456def-7890-abcdef"
}
```

The adapter extracts `MessageId` as the `providerMessageId`. SES includes this ID in SNS notification payloads for correlation.

---

## Configuration Set

The adapter uses a Configuration Set to route delivery events to SNS. The Configuration Set must be pre-created in AWS with:
- Event destination: SNS topic
- Tracked events: Send, Delivery, Bounce, Complaint, Reject, Open, Click

---

## IAM Authentication

The adapter uses standard AWS credential resolution:
1. Explicit credentials (`SES_ACCESS_KEY_ID` + `SES_SECRET_ACCESS_KEY`)
2. Environment variables (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`)
3. EC2/ECS instance role (recommended for production)

---

## Environment Variables

| Variable | Required | Description | Example |
|---|---|---|---|
### SMTP Mode Variables (Active)

| Variable | Required | Description | Example |
|---|---|---|---|
| `SES_MODE` | Yes | Delivery mode — set to `smtp` | `smtp` |
| `SES_REGION` | Yes | AWS region (used to build SMTP host: `email-smtp.{region}.amazonaws.com`) | `us-east-1` |
| `SES_SMTP_USERNAME` | Yes | SMTP username — generated via SES console, NOT IAM access key | `AKIA...` |
| `SES_SMTP_PASSWORD` | Yes | SMTP password — SES-derived value, NOT IAM secret key | `generated-smtp-password` |
| `SES_FROM_EMAIL` | Yes | Default sender email (must be verified in SES) | `noreply@example.com` |
| `SES_FROM_NAME` | No | Default sender name | `Notifications` |
| `SES_SMTP_PORT` | No | SMTP port (default 587) — STARTTLS: 25/587/2587, TLS Wrapper: 465/2465 | `587` |
| `SES_TIMEOUT_MS` | No | SMTP connection timeout (default 10000) | `10000` |

### API Mode Variables (Not Active)

| Variable | Required | Description | Example |
|---|---|---|---|
| `SES_MODE` | — | Set to `api` to enable API mode | `api` |
| `SES_ACCESS_KEY_ID` | Yes* | IAM access key (*required if no instance role) | `AKIA...` |
| `SES_SECRET_ACCESS_KEY` | Yes* | IAM secret key (*required if no instance role) | `wJal...` |
| `SES_CONFIGURATION_SET` | No | Configuration Set name for event tracking via SNS | `notification-api-tracking` |

### Optional Variables (Both Modes)

| Variable | Required | Description | Example |
|---|---|---|---|
| `SES_CONFIGURATION_SET` | No | Configuration Set name for delivery event tracking via SNS | `notification-api-tracking` |
| `SES_SNS_TOPIC_ARN` | No | SNS topic ARN (for subscription confirmation validation) | `arn:aws:sns:us-east-1:123:ses-events` |

---

*Provider Adapters Documentation — AWS SES Reference — 2026*
