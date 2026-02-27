# AWS SES Adapter Reference

**adapter-aws-ses — Port 3174**

---

## Overview

The AWS SES adapter handles email delivery via Amazon Simple Email Service (SES) v2. It supports two delivery modes: API mode using the `@aws-sdk/client-sesv2` `SendEmailCommand`, and SMTP relay mode using Nodemailer. The adapter uses IAM authentication and AWS SES Configuration Sets for delivery event tracking via SNS notifications.

| Attribute | Value |
|---|---|
| **Provider** | AWS SES |
| **Channels** | Email |
| **Port** | 3174 |
| **SDK/Client** | `@aws-sdk/client-sesv2` (API mode) or Nodemailer (SMTP mode) |
| **Auth** | IAM credentials (Access Key + Secret Key) or IAM role (EC2/ECS) |
| **Estimated LOC** | ~400 |

---

## Delivery Modes

The adapter supports two mutually exclusive modes, selected via `SES_MODE`:

### API Mode (`SES_MODE=api`)
Uses `@aws-sdk/client-sesv2` `SendEmailCommand` for JSON-based email sending. Preferred for most use cases.

### SMTP Mode (`SES_MODE=smtp`)
Uses Nodemailer with SMTP transport. Required for raw MIME emails with complex attachments. Connects to `email-smtp.{region}.amazonaws.com:587` (STARTTLS).

> **Info:** API mode is recommended for new implementations. SMTP mode is available for compatibility with systems that require raw MIME email construction or for complex multipart messages.

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

## Error Classification

| HTTP Status / Error | Error Type | Retryable | Notes |
|---|---|---|---|
| Success | Success | — | Email queued |
| `MessageRejected` | Rejected | No | Content policy violation or sandbox restriction |
| `MailFromDomainNotVerified` | Config Error | No | Sending domain not verified |
| `AccountSendingPaused` | Account Error | No | Sending paused (reputation issue) |
| `LimitExceeded` | Rate Limited | Yes | Sending rate exceeded |
| `ThrottlingException` | Rate Limited | Yes | API rate limit |
| `ServiceUnavailableException` | Server Error | Yes | Temporary SES issue |
| `InternalFailure` | Server Error | Yes | SES internal error |

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
| `SES_MODE` | No | Delivery mode: `api` (default) or `smtp` | `api` |
| `SES_REGION` | Yes | AWS region | `us-east-1` |
| `SES_ACCESS_KEY_ID` | No* | IAM access key (*required if no instance role) | `AKIA...` |
| `SES_SECRET_ACCESS_KEY` | No* | IAM secret key (*required if no instance role) | `wJal...` |
| `SES_CONFIGURATION_SET` | Yes | Configuration Set name for event tracking | `notification-api-tracking` |
| `SES_FROM_EMAIL` | No | Default sender email | `noreply@example.com` |
| `SES_FROM_NAME` | No | Default sender name | `Notifications` |
| `SES_SNS_TOPIC_ARN` | No | SNS topic ARN (for subscription confirmation) | `arn:aws:sns:us-east-1:123:ses-events` |
| `SES_SMTP_USERNAME` | No* | SMTP username (*required for SMTP mode) | `AKIA...` |
| `SES_SMTP_PASSWORD` | No* | SMTP password (*required for SMTP mode) | `generated-smtp-password` |
| `SES_TIMEOUT_MS` | No | HTTP timeout (default 10000) | `10000` |

---

*Provider Adapters Documentation — AWS SES Reference — 2026*
