---

## 9. Email Ingest Service

### Purpose

The Email Ingest Service extends the platform's event ingestion capabilities to support closed or legacy systems that cannot publish events via RabbitMQ or REST webhooks — systems that can only send emails. It acts as an SMTP server, receives emails from these source systems, parses them against configurable criteria (sender patterns, subject regex, body extraction rules), and generates standardized events that are published to the Event Ingestion layer via RabbitMQ.

| Attribute | Value |
|---|---|
| **Technology** | NestJS + `smtp-server` npm package |
| **REST Port** | `3157` |
| **SMTP Port** | `2525` |
| **Schema** | PostgreSQL — `email_ingest_service` |
| **Dependencies** | RabbitMQ, PostgreSQL |

### Responsibilities

- **SMTP Server:** Runs an embedded SMTP server on port `2525` using the `smtp-server` npm package. Accepts inbound emails from whitelisted source systems and processes them through the parsing pipeline.
- **Sender Whitelisting:** Maintains a registry of authorized email sources (`email_sources` table). Only emails from registered sender patterns are accepted; all others are rejected at the SMTP level.
- **Email Parsing:** Applies configurable parsing rules to extract structured data from incoming emails. Rules match on sender patterns, subject line regex, and body content extraction using regular expressions.
- **Event Generation:** Transforms parsed email data into canonical events using configurable payload templates. Generated events are published to the `xch.events.incoming` RabbitMQ exchange with routing key `source.email-ingest.{eventType}`.
- **Parsing Rule Management:** Exposes REST API endpoints for CRUD operations on email parsing rules, allowing the operative team to configure how emails are parsed and mapped to events via the Admin UI.
- **Audit Trail:** Stores all received emails and their processing results in the `processed_emails` table for debugging, auditing, and reprocessing capabilities.

### SMTP Configuration

| Setting | Value | Description |
|---|---|---|
| **Port** | `2525` | Non-standard SMTP port to avoid conflicts with system mail services |
| **TLS** | STARTTLS supported | Opportunistic TLS encryption for inbound connections |
| **Auth** | Optional SMTP AUTH | Configurable per-source authentication (PLAIN/LOGIN) |
| **Max Message Size** | 10 MB | Configurable limit to prevent oversized email processing |
| **Concurrency** | 10 concurrent connections | Limits simultaneous SMTP sessions to manage resource usage |

### Email Parsing Rule Schema

```json
{
  "ruleId": "uuid",
  "name": "ERP Order Confirmation",
  "sourceFilter": {
    "senderPattern": "*@erp-system.company.com",
    "subjectRegex": "^Order Confirmation #\\d+"
  },
  "bodyParsing": {
    "format": "html | text",
    "extractionRules": [
      {
        "field": "orderNumber",
        "regex": "Order #(\\d+)"
      }
    ]
  },
  "eventMapping": {
    "eventType": "order.confirmed",
    "payloadTemplate": {
      "orderNumber": "{{orderNumber}}"
    }
  },
  "isActive": true
}
```

### Key API Endpoints

**GET** `/health` — Health check endpoint. Returns the service status, SMTP server health, RabbitMQ connection health, and database connectivity.

**GET** `/parsing-rules` — List all email parsing rules. Supports query parameters: `isActive`, `eventType`, `page`, `limit`.

**POST** `/parsing-rules` — Create a new email parsing rule. Requires `name`, `sourceFilter`, `bodyParsing`, and `eventMapping` fields. Validates regex patterns before persisting.

**PUT** `/parsing-rules/:id` — Update an existing parsing rule. Supports partial updates. Changes take effect immediately for subsequent incoming emails.

**DELETE** `/parsing-rules/:id` — Delete a parsing rule. Soft-deletes the rule (sets `isActive` to false) to preserve audit history.

**GET** `/processed-emails` — List processed emails with filters. Supports query parameters: `status` (parsed, failed, skipped), `sender`, `dateFrom`, `dateTo`, `page`, `limit`.

**GET** `/processed-emails/:id` — Retrieve full details for a specific processed email, including the original email content, matched parsing rule, extracted fields, and generated event payload.

### Database Tables

| Table | Description | Key Columns |
|---|---|---|
| `email_parsing_rules` | Configurable rules mapping email criteria to event types | `id`, `name`, `sender_pattern`, `subject_regex`, `body_parsing_config`, `event_type`, `payload_template`, `is_active`, `created_at`, `updated_at` |
| `processed_emails` | Log of all received and parsed emails (audit trail) | `id`, `message_id`, `sender`, `subject`, `received_at`, `matched_rule_id`, `extracted_data`, `generated_event_id`, `status`, `error_message` |
| `email_sources` | Registered source system identities (sender whitelist, auth config) | `id`, `name`, `sender_pattern`, `description`, `auth_config`, `is_active`, `created_at` |

### RabbitMQ Configuration

| Direction | Exchange | Routing Key | Purpose |
|---|---|---|---|
| Publishes | `xch.events.incoming` | `source.email-ingest.{eventType}` | Publish parsed email events for downstream processing by Event Ingestion Service |

> **Info:** **SMTP Security**
> The Email Ingest Service implements multiple security layers: sender whitelisting ensures only registered source systems can submit emails, STARTTLS provides encryption for inbound SMTP connections, optional SMTP AUTH adds per-source authentication, and all incoming emails are size-limited and rate-limited to prevent abuse. Emails from unknown senders are rejected at the SMTP handshake level before any content is accepted.

> **Note:** **Email Parsing Reliability**
> Email parsing is inherently less structured than REST or RabbitMQ event ingestion. Parsing rules should be thoroughly tested with sample emails before activation. The service logs all parsing failures with the original email content for investigation. When a parsing rule fails to extract required fields, the email is stored with a `failed` status and no event is generated — preventing malformed data from entering the notification pipeline. Operators can review failed emails through the Admin UI and adjust parsing rules accordingly.

