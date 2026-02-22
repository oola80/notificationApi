# Mailgun Integration Analysis

**Notification API -- Mailgun as Email Provider Evaluation**

| | |
|---|---|
| **Date:** | 2026-02-21 |
| **Author:** | Architecture Team |
| **Status:** | Analysis |

---

## Table of Contents

1. [Scenario Description](#1-scenario-description)
2. [How Mailgun Works](#2-how-mailgun-works)
3. [Mapping to Our Current Architecture](#3-mapping-to-our-current-architecture)
4. [The Template Ownership Question](#4-the-template-ownership-question)
5. [Impact Analysis by Service](#5-impact-analysis-by-service)
6. [Scenario A: Mailgun as Dumb Pipe (Recommended)](#6-scenario-a-mailgun-as-dumb-pipe-recommended)
7. [Scenario B: Mailgun Handles Templates](#7-scenario-b-mailgun-handles-templates)
8. [Comparison Matrix](#8-comparison-matrix)
9. [Webhook & Delivery Tracking Integration](#9-webhook--delivery-tracking-integration)
10. [Migration Path from SendGrid](#10-migration-path-from-sendgrid)
11. [Recommendations](#11-recommendations)

---

## 1. Scenario Description

The scenario under evaluation: **replace SendGrid with Mailgun as the email delivery provider**, with particular attention to the fact that Mailgun offers its own server-side Handlebars template engine with versioning.

This raises a fundamental architecture question: should Mailgun handle HTML template rendering (delegating template ownership to the provider), or should our Template Service continue to render templates locally and send Mailgun pre-rendered HTML?

---

## 2. How Mailgun Works

### 2.1 Sending API

Mailgun exposes a REST API at `https://api.mailgun.net/v3/{domain}/messages`. Authentication uses HTTP Basic Auth (`api:YOUR_API_KEY`). Messages are sent as `multipart/form-data` with parameters for `from`, `to`, `subject`, `html`/`text`, attachments, and various options.

```
POST /v3/{domain_name}/messages
Authorization: Basic base64("api:YOUR_API_KEY")
Content-Type: multipart/form-data

from=sender@domain.com
to=recipient@example.com
subject=Order Shipped
html=<h1>Your order has shipped</h1>
```

On success, Mailgun returns a message ID and queues the email:

```json
{
  "id": "<message-id@domain.mailgun.org>",
  "message": "Queued. Thank you."
}
```

### 2.2 Mailgun's Template System

Mailgun includes a server-side template engine based on **Handlebars** -- the same engine our Template Service uses.

| Feature | Mailgun | Our Template Service |
|---------|---------|---------------------|
| **Engine** | Handlebars (customized fork) | Handlebars.js |
| **Template limit** | 100 templates per domain | Unlimited (PostgreSQL-backed) |
| **Version limit** | 40 versions per template | Unlimited (append-only) |
| **Version identifier** | String tag (e.g., `"v1"`, `"initial"`) | Auto-incremented integer |
| **Variable syntax** | `{{variable}}` | `{{variable}}` |
| **Block helpers** | `if`, `unless`, `each`, `with`, `equal` | `if`, `unless`, `each`, `with` + custom helpers (`formatCurrency`, `formatDate`, `eq`, `gt`, `default`, `truncate`, `uppercase`, `lowercase`) |
| **Custom helpers** | Not supported | Fully supported (8 registered helpers) |
| **Multi-channel** | Email only | Email, SMS, WhatsApp, Push |
| **Variable auto-detection** | No | Yes (parsed and stored in `template_variables`) |
| **Preview/test endpoint** | No dedicated endpoint | `POST /templates/:id/preview` |
| **Caching** | Provider-managed | In-memory LRU with warm-up |

To send using a Mailgun template:

```
POST /v3/{domain}/messages
template=order-shipped
t:variables={"customerName": "Jane Doe", "orderNumber": "ORD-001"}
t:version=v3
```

### 2.3 Batch Sending

Mailgun supports sending to **up to 1,000 recipients per API call** with per-recipient personalization via `recipient-variables`:

```json
{
  "alice@example.com": {"name": "Alice", "orderId": "A-100"},
  "bob@example.com": {"name": "Bob", "orderId": "B-200"}
}
```

Variables are referenced in the body as `%recipient.name%` (different syntax from Handlebars `{{name}}`).

### 2.4 Webhooks & Event Tracking

Mailgun provides comprehensive delivery event webhooks:

| Event | Description | Maps to Our Status |
|-------|-------------|--------------------|
| `accepted` | Mailgun accepted the message | SENT |
| `delivered` | Successfully delivered to recipient's mail server | DELIVERED |
| `temporary_fail` | Soft bounce (mailbox full, etc.) -- Mailgun retries | (internal retry) |
| `permanent_fail` | Hard bounce (address doesn't exist) | FAILED |
| `opened` | Recipient opened the email | (audit analytics) |
| `clicked` | Recipient clicked a link | (audit analytics) |
| `unsubscribed` | Recipient unsubscribed | (preference update) |
| `complained` | Recipient marked as spam | (suppression list) |

Webhooks are signed with HMAC-SHA256 using a dedicated Webhook Signing Key (separate from the API key).

### 2.5 Node.js SDK

Official SDK: `mailgun.js` (npm) with TypeScript definitions. Requires `form-data` as a dependency. Fits the NestJS/TypeScript stack.

```typescript
import FormData from 'form-data';
import Mailgun from 'mailgun.js';

const mailgun = new Mailgun(FormData);
const mg = mailgun.client({ username: 'api', key: 'YOUR_API_KEY' });

const result = await mg.messages.create('mg.example.com', {
  from: 'sender@mg.example.com',
  to: ['recipient@example.com'],
  subject: 'Order Shipped',
  html: '<h1>Your order has shipped</h1>'
});
```

### 2.6 Rate Limits

- New/unverified accounts: ~100 messages/hour until business verification.
- Post-verification: limits depend on plan tier (not published as fixed numbers like SendGrid's 100/sec).
- Mailgun handles ESP-level throttling automatically (warm-up behavior built in).
- Batch limit: 1,000 recipients per API call.

---

## 3. Mapping to Our Current Architecture

### 3.1 Current Email Delivery Flow

```
Notification Engine                Template Service              Channel Router           SendGrid
       |                                |                             |                      |
       |  POST /templates/:id/render    |                             |                      |
       |  { channel: "email", data }    |                             |                      |
       |------------------------------->|                             |                      |
       |  200 OK { rendered HTML }      |                             |                      |
       |<-------------------------------|                             |                      |
       |                                                              |                      |
       |  Publish to xch.notifications.deliver                        |                      |
       |  routing: notification.deliver.{priority}.email              |                      |
       |  payload: { rendered subject, rendered body, media, ... }    |                      |
       |------------------------------------------------------------->|                      |
       |                                                              |                      |
       |                                                              |  SendGrid API POST   |
       |                                                              |  (pre-rendered HTML)  |
       |                                                              |--------------------->|
       |                                                              |  200 OK (msg ID)     |
       |                                                              |<---------------------|
```

**Key observation:** In our current design, the Channel Router receives **pre-rendered HTML** from the Notification Engine (which got it from the Template Service). The Channel Router is a "dumb pipe" for content -- it only cares about delivery mechanics (provider API, retries, circuit breaker, attachments).

### 3.2 Where Mailgun Fits

Mailgun replaces SendGrid as the email provider adapter **inside the Channel Router Service**. The question is whether the Channel Router sends:

- **(A) Pre-rendered HTML** -- same as today, just swap the provider API call.
- **(B) A Mailgun template name + variables** -- delegate rendering to Mailgun.

---

## 4. The Template Ownership Question

This is the central architectural decision. There are significant trade-offs.

### 4.1 Why Mailgun Templates Are Tempting

- **Offload rendering compute** to the provider (marginal benefit -- rendering is sub-millisecond locally).
- **Use Mailgun's preview tools** in their dashboard.
- **Less HTML in transit** -- send template name + variables instead of full HTML body.

### 4.2 Why Mailgun Templates Are Problematic for This Architecture

| Concern | Impact |
|---------|--------|
| **Multi-channel rendering breaks** | Our Template Service renders for email, SMS, WhatsApp, and push from a single template entity. If email rendering moves to Mailgun, we'd need to split template management: Mailgun for email, our service for everything else. Same template content would live in two systems. |
| **Template versioning diverges** | Our immutable version model (auto-incremented integers, unlimited versions, `current_version_id` pointer) is incompatible with Mailgun's tag-based versioning (string tags, max 40 versions per template). The Notification Engine pins template versions for in-flight notifications -- this requires our versioning model. |
| **Custom helpers are lost** | Our Template Service registers 8 custom Handlebars helpers (`formatCurrency`, `formatDate`, `eq`, `gt`, `default`, `truncate`, `uppercase`, `lowercase`). Mailgun does not support custom helpers. Templates using `{{formatCurrency totalAmount "USD"}}` would fail on Mailgun. |
| **Variable auto-detection is lost** | Our service auto-detects all variables from template content and stores them in `template_variables` for documentation, validation, and the Admin UI variable editor. Mailgun has no equivalent. |
| **Template limit: 100 per domain** | Mailgun limits templates to 100 per domain. Our system has no such limit. For a growing eCommerce platform with many event types, this could become a constraint. |
| **Admin UI integration fractures** | The Admin UI manages templates through a single interface (Gateway -> Template Service). If email templates live on Mailgun, the Admin UI would need to manage templates in two systems -- or we'd need a synchronization layer. |
| **Provider lock-in** | Templates stored on Mailgun mean switching email providers requires migrating all templates. With pre-rendered HTML, any provider works with zero template migration. |
| **Preview and testing breaks** | Our `POST /templates/:id/preview` endpoint renders all channels with sample data in a single call. Email preview would need a separate Mailgun API call with different variable format. |
| **Rendering audit trail is lost** | Our Template Service publishes `template.render.completed` and `template.render.failed` audit events for every render. If Mailgun renders, we lose this observability. |
| **Batch variable syntax conflict** | Mailgun batch sending uses `%recipient.variable%` syntax, which is different from Handlebars `{{variable}}`. Templates would need to use two syntaxes for the same variables depending on whether they're batch or single-send. |

---

## 5. Impact Analysis by Service

### 5.1 Channel Router Service (Primary Impact)

The Channel Router's email adapter module needs to change from SendGrid SDK to Mailgun SDK. This is the **only service that changes** in Scenario A.

| Component | SendGrid (Current) | Mailgun (Swap) |
|-----------|--------------------|--------------------|
| **SDK** | `@sendgrid/mail` | `mailgun.js` + `form-data` |
| **Auth** | API key in header (`Authorization: Bearer`) | HTTP Basic Auth (`api:key`) |
| **Send endpoint** | `POST /v3/mail/send` (JSON) | `POST /v3/{domain}/messages` (multipart/form-data) |
| **Attachments** | `attachments[]` array (Base64) | `attachment` multipart field (binary) |
| **Rate limiting** | 100 emails/sec (Pro plan) | Plan-dependent; auto-throttled by Mailgun |
| **Webhook events** | Similar set (delivered, bounce, open, click, spam) | `delivered`, `permanent_fail`, `temporary_fail`, `opened`, `clicked`, `complained`, `unsubscribed` |
| **Webhook verification** | Signature-based | HMAC-SHA256 with dedicated signing key |

### 5.2 Template Service (No Change in Scenario A)

If we keep rendering locally (Scenario A), the Template Service is completely unaffected. It continues to render Handlebars templates for all channels, including email, and return pre-rendered HTML to the Notification Engine.

### 5.3 Notification Engine (No Change in Scenario A)

The Notification Engine continues to call `POST /templates/:id/render` for email, receive rendered HTML, and publish to `xch.notifications.deliver`. No awareness of which email provider is downstream.

### 5.4 Audit Service (Minor Webhook Mapping Change)

The Audit Service needs updated webhook event type mappings if we switch to Mailgun webhooks. The event names differ slightly:

| Our Status | SendGrid Event | Mailgun Event |
|------------|---------------|---------------|
| SENT | `processed` | `accepted` |
| DELIVERED | `delivered` | `delivered` |
| FAILED (hard bounce) | `bounce` | `permanent_fail` |
| FAILED (soft bounce) | `deferred` | `temporary_fail` |
| (analytics) opened | `open` | `opened` |
| (analytics) clicked | `click` | `clicked` |
| (suppression) spam | `spamreport` | `complained` |
| (preference) unsub | `unsubscribe` | `unsubscribed` |

### 5.5 Admin Service & Admin UI (No Change in Scenario A)

Template management, channel configuration, and dashboard metrics remain unchanged. The only admin change is updating the email provider credentials in `provider_configs`.

---

## 6. Scenario A: Mailgun as Dumb Pipe (Recommended)

### How It Works

```
Notification Engine          Template Service         Channel Router            Mailgun
       |                          |                        |                      |
       |  POST /templates/        |                        |                      |
       |  :id/render              |                        |                      |
       |  { channel: "email",     |                        |                      |
       |    data: {...} }         |                        |                      |
       |------------------------->|                        |                      |
       |  200 OK                  |                        |                      |
       |  { rendered subject,     |                        |                      |
       |    rendered HTML body }  |                        |                      |
       |<-------------------------|                        |                      |
       |                                                   |                      |
       |  Publish to RabbitMQ                              |                      |
       |  xch.notifications.deliver                        |                      |
       |  { subject, html, to, from, media }               |                      |
       |-------------------------------------------------->|                      |
       |                                                   |                      |
       |                                                   |  POST /v3/{domain}/  |
       |                                                   |  messages            |
       |                                                   |  from=...            |
       |                                                   |  to=...              |
       |                                                   |  subject=...         |
       |                                                   |  html=<rendered>     |
       |                                                   |  attachment=<file>   |
       |                                                   |--------------------->|
       |                                                   |  200 { id, message } |
       |                                                   |<---------------------|
       |                                                   |                      |
       |                                                   |  Publish status      |
       |                                                   |  to xch.notif.status |
```

### What Changes

| Component | Change | Effort |
|-----------|--------|--------|
| Channel Router: Email adapter | Replace SendGrid SDK calls with `mailgun.js` calls. Send pre-rendered `html` and `subject` as-is. | Low -- adapter swap |
| Channel Router: Attachment handling | Change from SendGrid `attachments[]` JSON array to Mailgun `attachment` multipart field | Low -- format change |
| Channel Router: Webhook receiver | Update webhook endpoint to parse Mailgun's payload format and verify HMAC-SHA256 signature with Mailgun's Webhook Signing Key | Low-Medium |
| Channel Router: `provider_configs` | New config keys: `apiKey`, `domain`, `webhookSigningKey`, `fromAddress`, `fromName`, `region` (US/EU) | Config change |
| Channel Router: Rate limiter | Update token bucket config for Mailgun's rate limits (plan-dependent, less rigid than SendGrid's 100/sec) | Config change |
| Audit Service: Event mapping | Map Mailgun event names to our internal statuses | Low |

### What Stays the Same

- Template Service: No change. Renders email HTML locally as before.
- Notification Engine: No change. Calls Template Service, publishes to Channel Router.
- Admin UI: No change. Template management unchanged.
- Database schemas: No change.
- RabbitMQ topology: No change.
- All other channels (SMS, WhatsApp, Push): No change.

### Pros

- **Minimal blast radius** -- only the Channel Router email adapter changes.
- **Zero template migration** -- templates stay in our PostgreSQL-backed service.
- **Custom helpers preserved** -- `formatCurrency`, `formatDate`, etc. continue to work.
- **Multi-channel consistency** -- all channels rendered by the same engine from the same templates.
- **Provider agnostic** -- can swap to any email provider (SendGrid, Mailgun, Amazon SES, Postmark) by changing only the adapter.
- **No vendor lock-in** -- templates are not stored on the provider.
- **Full observability** -- render audit events, variable validation, output limit checks all intact.

### Cons

- **Mailgun's template features are unused** -- paid for but not leveraged.
- **Slightly larger API payloads** -- sending full HTML body instead of a template reference + variables. (Negligible impact -- typical email HTML is 10-50 KB.)

---

## 7. Scenario B: Mailgun Handles Templates

### How It Would Work

```
Notification Engine                                Channel Router            Mailgun
       |                                                |                      |
       |  (Skip Template Service for email)             |                      |
       |  Publish to RabbitMQ                           |                      |
       |  xch.notifications.deliver                     |                      |
       |  { templateSlug, variables, to, from, media }  |                      |
       |----------------------------------------------->|                      |
       |                                                |                      |
       |                                                |  POST /v3/{domain}/  |
       |                                                |  messages            |
       |                                                |  template=order-     |
       |                                                |    shipped           |
       |                                                |  t:variables={...}   |
       |                                                |  t:version=v3        |
       |                                                |--------------------->|
       |                                                |  200 { id, message } |
       |                                                |<---------------------|
```

### What Changes

| Component | Change | Effort |
|-----------|--------|--------|
| **Notification Engine** | Must branch logic by channel: skip Template Service render for email, still render for SMS/WhatsApp/Push. Must pass template slug + raw variables (not rendered HTML) to Channel Router for email. | **High -- core pipeline change** |
| **Channel Router: Email adapter** | Must send `template` + `t:variables` instead of `html`. Must handle Mailgun template errors (template not found, missing variables) at delivery time. | Medium |
| **Template Service** | Still needed for SMS, WhatsApp, Push. Email templates must be dual-maintained: once in our DB (for preview, variable detection, Admin UI) and once on Mailgun (for rendering). Or removed from our DB (losing all management features). | **High -- split ownership** |
| **Admin UI** | Must either integrate with Mailgun's template API for email templates, or maintain a sync layer that pushes template changes to both our DB and Mailgun. | **High -- dual-system management** |
| **Template sync layer** | New component needed to keep our Template Service and Mailgun templates in sync. Must handle: slug mapping, version mapping (integer -> tag), content transformation (strip custom helpers), conflict resolution. | **High -- new infrastructure** |
| **RabbitMQ message schema** | The dispatch message to `xch.notifications.deliver` must carry different payloads depending on whether the channel was pre-rendered (SMS/WhatsApp/Push) or needs provider-side rendering (email). | Medium -- schema change |

### Pros

- Uses Mailgun's built-in rendering (offloads compute -- marginal benefit).
- Smaller API payloads for email sends (template name + variables instead of full HTML).
- Access to Mailgun's template preview in their dashboard.

### Cons

- **High complexity** -- Notification Engine must branch email vs. other channels, breaking the uniform rendering pipeline.
- **Dual template management** -- email templates exist in two systems. Sync is fragile and error-prone.
- **Custom helpers lost** -- `{{formatCurrency totalAmount "USD"}}` does not work on Mailgun. Every template using custom helpers must be rewritten with pre-computed values or inline logic.
- **Variable auto-detection lost** for email -- Mailgun does not report which variables a template uses.
- **Template limit: 100 per domain** -- hard cap on Mailgun's side.
- **Version limit: 40 per template** -- requires cleanup/rotation strategy.
- **Preview inconsistency** -- email preview comes from Mailgun API; other channels from our preview endpoint.
- **Audit gap** -- no `template.render.completed` event for email; rendering happens inside Mailgun with no visibility.
- **Provider lock-in** -- switching from Mailgun to another provider requires migrating all email templates back.
- **Batch variable syntax mismatch** -- `%recipient.var%` (batch) vs `{{var}}` (single send). Templates must handle both or batching must pre-render.

---

## 8. Comparison Matrix

| Criterion | Scenario A (Dumb Pipe) | Scenario B (Mailgun Templates) |
|-----------|----------------------|-------------------------------|
| **Implementation effort** | Low (adapter swap) | High (pipeline branching, sync layer, Admin UI changes) |
| **Blast radius** | Channel Router only | Notification Engine, Channel Router, Template Service, Admin UI |
| **Template consistency** | Single source of truth (our Template Service) | Split across two systems |
| **Custom Handlebars helpers** | Fully preserved | Lost -- requires template rewrites |
| **Multi-channel rendering** | Uniform pipeline for all channels | Email is special-cased, others unchanged |
| **Provider portability** | Swap any email provider with adapter change | Locked to Mailgun (templates stored there) |
| **Template limits** | Unlimited (PostgreSQL) | 100 templates, 40 versions each |
| **Variable auto-detection** | Preserved | Lost for email |
| **Admin UI impact** | None | Requires dual-system integration |
| **Render observability** | Full audit trail | No render events for email |
| **Preview consistency** | All channels from one endpoint | Email from Mailgun, others from our service |
| **Operational complexity** | Low | High (sync layer, dual monitoring) |

---

## 9. Webhook & Delivery Tracking Integration

Regardless of scenario, Mailgun's webhooks need to be integrated for delivery status tracking. This is a concern for the **Channel Router** (receives webhooks) and **Audit Service** (consumes status events).

### 9.1 Webhook Endpoint

The Channel Router must expose a new webhook endpoint for Mailgun callbacks:

```
POST /webhooks/mailgun
```

### 9.2 Signature Verification

Mailgun signs webhooks using HMAC-SHA256 with a dedicated **Webhook Signing Key** (separate from the API key):

```typescript
import * as crypto from 'crypto';

function verifyMailgunWebhook(
  signingKey: string,
  timestamp: string,
  token: string,
  signature: string
): boolean {
  const digest = crypto
    .createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(signature)
  );
}
```

### 9.3 Event Mapping

```
Mailgun Event           ->  Channel Router Action        ->  Audit Service Status
-----------                 ---------------------            -------------------
accepted                    Publish SENT status              Record SENT
delivered                   Publish DELIVERED status          Record DELIVERED
temporary_fail              Log, await Mailgun retry         Record SOFT_BOUNCE
permanent_fail              Publish FAILED status            Record HARD_BOUNCE
opened                      Publish engagement event         Record OPENED
clicked                     Publish engagement event         Record CLICKED
unsubscribed                Publish preference event         Record UNSUBSCRIBED
complained                  Publish suppression event        Record SPAM_COMPLAINT
```

### 9.4 Provider Message ID Correlation

Mailgun returns a message ID on send: `<message-id@domain.mailgun.org>`. This is stored in the `delivery_attempts.provider_message_id` column. When webhooks arrive, they include this ID in `event-data.message.headers.message-id`, enabling reliable correlation back to the notification.

### 9.5 Mailgun's Built-In Retry

Unlike SendGrid, Mailgun automatically retries `temporary_fail` events internally before surfacing them. This means the Channel Router may not need to implement its own retry logic for soft bounces -- Mailgun handles this. The Channel Router's retry logic focuses on:

- **API call failures** (network errors, timeouts, 5xx from Mailgun) -- retry the API call itself.
- **Permanent failures** (`permanent_fail` webhook) -- mark as FAILED, trigger fallback channel if configured.

This simplifies the Channel Router's email retry strategy compared to SendGrid.

---

## 10. Migration Path from SendGrid

### 10.1 Phase 1: Add Mailgun Adapter (Parallel Operation)

1. Implement the Mailgun email adapter in Channel Router alongside the existing SendGrid adapter.
2. Configure Mailgun provider in `provider_configs` table.
3. Set up Mailgun webhook endpoint and signature verification.
4. Route a small percentage of email traffic to Mailgun (canary deployment via channel config).

### 10.2 Phase 2: Validate & Monitor

1. Compare delivery metrics between SendGrid and Mailgun (delivery rates, latency, bounce rates).
2. Verify webhook event correlation and audit trail completeness.
3. Test circuit breaker behavior under Mailgun failure conditions.
4. Validate attachment handling (different multipart format).

### 10.3 Phase 3: Full Cutover

1. Route 100% of email traffic to Mailgun.
2. Deactivate SendGrid adapter (keep code for rollback).
3. Update `provider_configs` to mark SendGrid as inactive.

### 10.4 Multi-Provider Future

The Channel Router's adapter pattern supports having **both providers active simultaneously**. This enables:

- **Provider failover** -- if Mailgun's circuit breaker opens, fall back to SendGrid.
- **Load distribution** -- split traffic across providers for resilience.
- **A/B testing** -- compare provider deliverability metrics.

---

## 11. Recommendations

### Primary Recommendation: Scenario A (Mailgun as Dumb Pipe)

**Use Mailgun purely as a delivery transport.** Send pre-rendered HTML from our Template Service. Do not use Mailgun's template system.

**Rationale:**

1. **Architectural integrity** -- The current design has a clean, uniform rendering pipeline: Notification Engine calls Template Service for all channels, then publishes rendered content to Channel Router. This is a core architectural strength. Scenario B fractures this by special-casing email.

2. **Our Template Service is more capable** -- It supports custom helpers, unlimited templates/versions, multi-channel variants, variable auto-detection, preview endpoints, and full audit logging. Mailgun's template system is a subset of this functionality.

3. **Provider independence** -- Our most critical design principle for the Channel Router is provider agnosticism. The Channel Router today can swap SendGrid for Mailgun, Amazon SES, Postmark, or any provider by changing only the adapter module. Storing templates on Mailgun violates this.

4. **Minimal implementation effort** -- Scenario A requires changes only in the Channel Router's email adapter. Scenario B requires changes across 4+ services, a new sync layer, and template rewrites.

5. **No template rewrites** -- Our templates use custom helpers (`formatCurrency`, `formatDate`, etc.) that Mailgun does not support. Scenario B would require rewriting every template that uses these helpers.

### Secondary Recommendations

1. **Implement multi-provider support** -- Use the Mailgun migration as an opportunity to make the Channel Router's email adapter pluggable. Support both SendGrid and Mailgun as active providers with configurable routing rules.

2. **Leverage Mailgun's auto-throttling** -- Mailgun's built-in ESP warm-up and throttling simplifies the Channel Router's rate limiting for email. Consider reducing the complexity of the token bucket rate limiter for Mailgun (it handles this internally).

3. **Leverage Mailgun's internal retry for soft bounces** -- Mailgun retries soft bounces automatically. The Channel Router only needs to retry API-level failures, not delivery-level transient errors. This simplifies the email retry strategy.

4. **Evaluate Mailgun's batch sending for bulk uploads** -- For the Bulk Upload Service flow (5,000 events in rapid succession), Mailgun's batch API (1,000 recipients per call) could reduce API call volume if multiple rows target the same template. However, this optimization is complex and should be deferred to a post-MVP phase.

5. **Set up Mailgun webhooks from day one** -- Configure all 8 webhook event types to flow through the Channel Router into the Audit Service. This provides delivery analytics parity with SendGrid.

### What to Ignore in Mailgun

| Mailgun Feature | Recommendation | Reason |
|-----------------|----------------|--------|
| Server-side templates | **Do not use** | Inferior to our Template Service; creates split ownership |
| Mailing lists | **Do not use** | Recipient resolution is handled by Notification Engine |
| Email validation | **Evaluate later** | Could supplement our validation, but not a priority |
| Routes (inbound email) | **Do not use** | We have a dedicated Email Ingest Service for inbound email processing |
| Suppressions management | **Integrate** | Sync Mailgun's bounce/complaint lists with our customer channel preferences |

---

*Notification API -- Architecture Team -- 2026*
