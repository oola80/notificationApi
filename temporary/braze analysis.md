# Braze Integration Analysis

**Date:** 2026-02-21
**Scenario:** Evaluate using Braze as the messaging provider instead of (or alongside) direct provider integrations (SendGrid, Twilio, FCM).

---

## 1. How Braze Works as a Messaging Provider

Braze is a **customer engagement platform** that acts as a unified delivery layer across all notification channels. Instead of integrating separately with SendGrid (email), Twilio (SMS/WhatsApp), and Firebase (push), you send a single API call to Braze and it handles routing to the appropriate downstream provider.

### Braze API Endpoints for Sending

| Endpoint | Purpose | Max Recipients |
|---|---|---|
| `POST /messages/send` | Immediate ad-hoc send with inline content | 50 per request |
| `POST /campaigns/trigger/send` | Trigger a pre-built campaign (templates in Braze) | 50 per request |
| `POST /canvas/trigger/send` | Trigger multi-step journeys | 50 per request |
| `POST /transactional/v1/campaigns/{id}/send` | Transactional email with delivery postbacks | 1 per request |

### Channel Support via Single API Call

A single `/messages/send` request can include message objects for **all channels simultaneously**:

```json
{
  "external_user_ids": ["user_123"],
  "messages": {
    "email":      { "subject": "...", "body": "<html>...</html>" },
    "sms":        { "subscription_group_id": "...", "body": "..." },
    "whats_app":  { "template_name": "...", "body_variables": [...] },
    "apple_push": { "alert": { "title": "...", "body": "..." } },
    "android_push": { "alert": "...", "title": "..." }
  }
}
```

### Braze Templating

- **Email:** Managed via Braze API (`POST /templates/email/create`) or dashboard. Uses **Liquid** templating (not Handlebars).
- **SMS:** Inline body text in the API call. Liquid personalization supported.
- **WhatsApp:** Templates **must** be created and approved in **Meta Business Manager**. Referenced by `template_name` + `template_language_code` in Braze API.
- **Push:** Inline title/body in API call. Liquid personalization supported.

### Braze User Model

Braze maintains its own **user profile database**. Recipients are identified by:
- `external_user_id` (your system's user ID -- primary method)
- `user_alias` (alternative identifier with label)
- `braze_id` (Braze's internal ID)

User data (attributes, email, phone, device tokens) is synced via `POST /users/track`.

### Delivery Tracking

| Mechanism | Channels | Format |
|---|---|---|
| Transactional HTTP postbacks | Email only (transactional) | Real-time webhook to your URL |
| Braze Currents | All channels | Avro files streamed to S3/Snowflake/etc. every 5 min |
| Dashboard analytics | All channels | Web UI only |

### Rate Limits

| Endpoint | Limit |
|---|---|
| `/messages/send` | 250,000 req/hour |
| `/campaigns/trigger/send` | 250,000 req/hour (shared) |
| `/users/track` | 3,000 req/3 sec |
| Transactional email | Contract-dependent (20K-50K/hour) |
| Max recipients per request | 50 |

---

## 2. Impact on Current Architecture

### Current Flow (Direct Providers)

```
Event --> Ingestion --> Engine --> Template Service (Handlebars) --> Channel Router --> SendGrid / Twilio / FCM
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                  We own templates & rendering      We own provider integration & retry logic
```

### With Braze as Provider

Two possible integration patterns emerge:

---

### Pattern A: "Braze as Dumb Pipe" (We render, Braze delivers)

```
Event --> Ingestion --> Engine --> Template Service (Handlebars) --> Channel Router --> Braze /messages/send
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                  We still own templates            Braze replaces SendGrid/Twilio/FCM
```

- Use `/messages/send` with **inline content** (pre-rendered HTML, text, etc.)
- Our Template Service renders with Handlebars as designed
- Channel Router sends rendered content to Braze instead of individual providers
- Braze acts as a delivery abstraction layer

**What changes:**
- Channel Router: Replace 4 provider integrations with 1 Braze integration
- Channel Router: Simplify rate limiting (one provider instead of four)
- Channel Router: Replace per-provider webhook handlers with Braze Currents consumer
- Everything else stays the same

**What stays the same:**
- Template Service (full Handlebars rendering)
- Notification Engine (rules, recipients, preferences)
- Event Ingestion Service
- All RabbitMQ topology

---

### Pattern B: "Braze as Template Owner" (Braze renders and delivers)

```
Event --> Ingestion --> Engine --> Channel Router --> Braze /campaigns/trigger/send
                                                     (Braze owns templates, renders with Liquid, delivers)
```

- Use `/campaigns/trigger/send` with **trigger_properties** (raw event data)
- Braze manages templates via Liquid in its dashboard/API
- Our Template Service becomes **unnecessary** for Braze-routed channels
- Channel Router passes event data directly to Braze

**What changes:**
- Template Service: Largely eliminated (or reduced to non-Braze channels)
- Channel Router: Sends data payloads instead of rendered content
- Template management: Moves to Braze dashboard or Braze API
- Templating language: Handlebars --> Liquid
- Template versioning: Handled by Braze internally

**What stays the same:**
- Event Ingestion Service
- Notification Engine (rules, recipients, preferences)
- RabbitMQ topology (mostly)

---

## 3. Detailed Comparison

### 3.1 Template Management

| Aspect | Current Design (Handlebars) | Braze Pattern A (We Render) | Braze Pattern B (Braze Renders) |
|---|---|---|---|
| Template storage | Our PostgreSQL | Our PostgreSQL | Braze platform |
| Templating engine | Handlebars.js | Handlebars.js | Liquid (Shopify variant) |
| Template versioning | Immutable versions in DB | Immutable versions in DB | Braze-managed |
| Template CRUD API | Our REST API | Our REST API | Braze REST API |
| Custom helpers | formatCurrency, formatDate, etc. | formatCurrency, formatDate, etc. | Liquid filters + Connected Content |
| Admin UI for templates | Our notification-admin-ui | Our notification-admin-ui | Braze dashboard (separate system) |
| WhatsApp templates | Stored in our DB | Stored in our DB | Meta Business Manager (required regardless) |

> **Key Insight:** WhatsApp templates must always be approved by Meta regardless of the approach. The difference is whether we store a *reference copy* in our system or only in Braze/Meta.

### 3.2 Channel Router & Delivery

| Aspect | Current Design | With Braze |
|---|---|---|
| Provider count | 4 (SendGrid, Twilio x2, FCM) | 1 (Braze) |
| API integrations to maintain | 4 different APIs | 1 unified API |
| Rate limiting | Per-provider token buckets | Single Braze rate limiter |
| Circuit breaker | Per-provider health tracking | Single Braze health tracking |
| Retry logic | Provider-specific error handling | Braze-specific error handling |
| Delivery webhooks | SendGrid, Twilio, FCM webhooks | Braze Currents or transactional postbacks |
| Provider failover | Not currently designed | Not available (single provider) |

### 3.3 Delivery Tracking & Audit

| Aspect | Current Design | With Braze |
|---|---|---|
| Real-time delivery status | Per-provider webhooks | Transactional postbacks (email only) |
| Bulk event streaming | N/A | Braze Currents (Avro, every 5 min, to S3/Snowflake) |
| Granularity | Per-notification via provider_message_id | Per-notification via dispatch_id / external_send_id |
| Latency | Near real-time (provider webhooks) | Email: real-time; Others: ~5 min delay (Currents batching) |
| Opens/clicks tracking | Provider-dependent | Braze handles natively |

### 3.4 Throughput & Scalability

| Metric | Current Design (Direct) | Via Braze |
|---|---|---|
| Email throughput | ~360K/hour (SendGrid Pro) | 250K req/hour * 50 recipients = **12.5M/hour** (theoretical) |
| SMS throughput | ~108K/hour (Twilio) | Same underlying providers, Braze rate applies |
| Push throughput | ~1.8M/hour (FCM) | Same underlying FCM, Braze rate applies |
| Batch efficiency | 1 API call per notification | Up to 50 recipients per API call |
| Rate limit visibility | Direct provider headers | Braze `X-RateLimit-*` headers |

> **Note:** Braze's 250K req/hour with 50 recipients per request gives a theoretical ceiling of 12.5M messages/hour, which far exceeds our 1M/day target. However, actual throughput depends on Braze's contract tier and downstream provider limits.

### 3.5 User Data Synchronization

| Aspect | Current Design | With Braze |
|---|---|---|
| Recipient data | Resolved by Engine from events | Must exist in Braze user profiles |
| Phone/email storage | In event payloads | Must be synced to Braze via `/users/track` |
| Device tokens | Managed by FCM directly | Must be synced to Braze |
| Customer preferences | Our `customer_channel_preferences` table | Can use Braze subscription states (or ours) |

> **Critical Consideration:** Braze requires recipients to exist as user profiles with contact info. This means either:
> - **Pre-sync:** Maintain a user sync pipeline that keeps Braze profiles updated (adds complexity)
> - **Inline create:** Use `"send_to_existing_only": false` and pass `attributes` in each send request (simpler but noisier)

---

## 4. Recommendations

### Recommended Approach: Pattern A ("Braze as Dumb Pipe") with Gradual Migration

**Rationale:**

1. **Minimal architecture disruption.** Pattern A preserves our Template Service, Notification Engine, and event-driven design. Only the Channel Router's provider layer changes.

2. **We keep template ownership.** Our Handlebars-based Template Service with immutable versioning, admin UI, and custom helpers is a significant investment. Handing template ownership to Braze means:
   - Losing version control we designed
   - Rewriting all templates in Liquid
   - Managing templates in a separate dashboard (Braze) outside our admin-ui
   - Losing the ability to preview/test templates in our system

3. **Simpler provider layer.** Replacing 4 provider integrations with 1 Braze integration reduces code, testing, and operational surface area in Channel Router.

4. **Braze adds value beyond delivery.** Even as a "dumb pipe," Braze provides:
   - Built-in deliverability optimization (email warm-up, IP reputation)
   - Automatic subscription management
   - Engagement analytics (opens, clicks) with minimal code
   - Connected Content for real-time data enrichment at send time

5. **WhatsApp constraint is provider-agnostic.** Whether we use Twilio or Braze, WhatsApp templates must be Meta-approved. Braze doesn't change this requirement.

### Implementation Approach

#### Phase 1: Braze as Additional Provider in Channel Router

```
Channel Router
  |-- ProviderStrategy (interface)
      |-- SendGridProvider   (existing)
      |-- TwilioSmsProvider  (existing)
      |-- TwilioWhatsAppProvider (existing)
      |-- FcmProvider        (existing)
      |-- BrazeEmailProvider (new)      <-- Add Braze as alternative email provider
      |-- BrazeSmsProvider   (new)      <-- Add Braze as alternative SMS provider
      |-- BrazeWhatsAppProvider (new)   <-- Add Braze as alternative WhatsApp provider
      |-- BrazePushProvider  (new)      <-- Add Braze as alternative push provider
```

- Register Braze as a provider in `provider_configs` table
- Configurable per-channel: "email uses Braze, SMS uses Twilio" etc.
- Enables A/B testing between providers
- Enables gradual migration channel-by-channel

#### Phase 2: User Profile Synchronization

- Build a lightweight sync module that:
  - Calls `POST /users/track` when new recipients are encountered
  - Maps our `customer_id` to Braze `external_user_id`
  - Syncs email, phone, and device tokens
  - Can run inline (in Channel Router before send) or as a background sync job

#### Phase 3: Delivery Status Integration

- Implement Braze Currents consumer in Audit Service (or a new adapter)
- Map Braze delivery events to our `notification_status_log` format
- For transactional emails, configure HTTP postback URL pointing to our audit webhook

#### Phase 4: Evaluate Full Migration

After running Braze in production, evaluate whether to:
- Consolidate all channels through Braze (retire direct providers)
- Explore Pattern B for specific use cases (marketing campaigns where Braze templates make sense)
- Keep hybrid approach (Braze for some channels, direct for others)

### What NOT to Do

1. **Don't adopt Pattern B as the primary approach.** Giving up template ownership to Braze means:
   - Two template management systems (Braze for delivery, ours for non-Braze channels)
   - Loss of immutable versioning we designed
   - Liquid vs Handlebars fragmentation
   - Vendor lock-in on template logic
   - Our admin-ui becomes incomplete (can't manage Braze templates)

2. **Don't skip user profile sync.** Braze requires user profiles to exist. Sending to unknown `external_user_ids` will silently fail or create orphan profiles.

3. **Don't try to sync customer_channel_preferences to Braze subscription groups.** Keep preference logic in our Engine. Braze subscription management adds complexity without clear benefit since we already have this solved.

---

## 5. Architecture Changes Summary

### Changes Required (Pattern A)

| Component | Change | Effort |
|---|---|---|
| **Channel Router** | Add BrazeProvider implementations (email, SMS, WhatsApp, push) | Medium |
| **Channel Router** | Add Braze API client (REST, auth, rate limiting) | Medium |
| **Channel Router** | Add user profile sync module (`/users/track`) | Medium |
| **Channel Router** | Add Braze-specific error handling and retry logic | Low |
| **Channel Router** | Update `provider_configs` table with Braze credentials | Low |
| **Audit Service** | Add Braze Currents consumer or transactional postback handler | Medium |
| **Audit Service** | Map Braze event schema to our `notification_status_log` | Low |
| **Template Service** | No changes | None |
| **Notification Engine** | No changes | None |
| **Event Ingestion** | No changes | None |
| **Admin UI** | Add provider selection per channel in configuration | Low |

### No Changes Required

- Template Service (templates, versioning, Handlebars rendering)
- Notification Engine (rules, recipients, preferences, suppression)
- Event Ingestion Service (normalization, priority assignment)
- RabbitMQ topology (exchanges, queues, routing keys)
- Database schemas (except `provider_configs` additions)

---

## 6. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| **Vendor lock-in** | High | Pattern A minimizes lock-in; Braze is a replaceable provider behind our ProviderStrategy interface |
| **Braze rate limits** | Medium | 250K req/hour is generous for 1M/day target; monitor `X-RateLimit-*` headers |
| **User profile sync lag** | Medium | Use inline `attributes` on send for real-time, background sync for bulk |
| **Delivery status delay** | Medium | Currents has ~5 min batching delay; transactional postbacks are real-time for email only |
| **Cost increase** | Medium | Braze is a premium platform; evaluate cost vs. direct provider pricing |
| **WhatsApp template approval** | Low | Same constraint regardless of provider; no additional risk |
| **Braze outage** | High | No failover to direct providers initially; Phase 1 hybrid approach mitigates this |

---

## 7. Cost Considerations

Braze pricing is **contract-based** (not publicly listed), typically structured as:
- Monthly Active Users (MAU) tiers
- Per-channel message volumes
- Data points (user attribute updates)
- Currents streaming (additional cost)

Compared to direct providers:
- **SendGrid Pro:** ~$90/month for 100K emails/month
- **Twilio SMS:** ~$0.0079/message
- **Twilio WhatsApp:** ~$0.005-0.08/message (varies by country)
- **FCM:** Free

Braze adds a **platform premium** on top of underlying provider costs. The value proposition is operational simplification, deliverability optimization, and engagement analytics. For a pure transactional notification system (no marketing campaigns or customer journeys), the premium may not be justified unless the operational simplification of a single provider integration is highly valued.

---

## 8. Final Verdict

**Braze fits well as a delivery provider in our architecture, but should NOT replace our template or orchestration layers.**

Our system's value is in the **event-driven orchestration** (ingestion, normalization, rules, preferences, suppression, lifecycle) -- none of which Braze replaces. Braze's value is in **multi-channel delivery infrastructure** with built-in deliverability, analytics, and subscription management.

The optimal integration is **Pattern A**: keep our full pipeline, slot Braze into the Channel Router as a unified provider, and benefit from simpler provider management without sacrificing architectural control.

If the business later needs **marketing automation features** (customer journeys, A/B testing campaigns, segmentation), Braze becomes even more valuable -- but those features are outside our current notification system scope and would complement rather than replace our transactional pipeline.
