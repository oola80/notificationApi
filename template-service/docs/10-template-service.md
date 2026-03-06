---

# 10 — Template Service

**Notification API — Template Service Deep-Dive**

| | |
|---|---|
| **Version:** | 1.0 |
| **Date:** | 2026-02-21 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Architecture & Integration Points](#2-architecture--integration-points)
3. [Template Lifecycle & Structure](#3-template-lifecycle--structure)
4. [Template Rendering Pipeline](#4-template-rendering-pipeline)
5. [Template Versioning](#5-template-versioning)
6. [Template Caching Strategy](#6-template-caching-strategy)
7. [Performance Evaluation: PostgreSQL vs NoSQL](#7-performance-evaluation-postgresql-vs-nosql)
8. [RabbitMQ Topology (Async Audit Logging)](#8-rabbitmq-topology-async-audit-logging)
9. [REST API Endpoints](#9-rest-api-endpoints)
10. [Database Design](#10-database-design)
11. [Media & Attachments in Templates](#11-media--attachments-in-templates)
12. [Sequence Diagrams](#12-sequence-diagrams)
13. [Error Handling](#13-error-handling)
14. [Security Considerations](#14-security-considerations)
15. [Monitoring & Health Checks](#15-monitoring--health-checks)
16. [Configuration](#16-configuration)

---

## 1. Service Overview

The Template Service manages the full lifecycle of notification message templates across all channels. It provides CRUD operations with immutable versioning, renders templates using the Handlebars engine with dynamic variable substitution, supports multi-channel variants (HTML email, plain text SMS, WhatsApp messages, push notification content), and publishes audit events asynchronously via RabbitMQ fire-and-forget messaging. The Notification Engine calls this service synchronously during the rendering phase of notification processing.

| Attribute | Value |
|---|---|
| **Technology** | NestJS (TypeScript) with Handlebars (`handlebars`) |
| **Port** | `3153` |
| **Schema** | PostgreSQL — `template_service` |
| **Dependencies** | PostgreSQL, RabbitMQ (async audit logging only) |
| **Source Repo Folder** | `template-service/` |

### Responsibilities

1. **Template CRUD:** Full create, read, update, and delete operations for notification templates. Each template has a unique slug, display name, description, and one or more channel variants.
2. **Multi-Channel Variants:** A single template supports different content variants for each notification channel — HTML-rich email, concise SMS (160-character limit), WhatsApp message (with optional media formatting), and push notification (title + body, 256-character total limit).
3. **Variable Substitution:** Uses Handlebars for dynamic content rendering. Supports simple variables (`{{customerName}}`), conditional blocks (`{{#if trackingUrl}}`), iteration (`{{#each items}}`), and custom helpers (e.g., `{{formatCurrency totalAmount currency}}`, `{{formatDate timestamp "MMM DD, YYYY"}}`).
4. **Template Versioning:** Every update creates a new immutable version. Previous versions are retained indefinitely. Active notifications reference a specific version ID, ensuring delivery consistency even if a template is modified after a notification is queued.
5. **Template Rendering:** Accepts a template ID, channel, and variable data from the Notification Engine (via synchronous HTTP), resolves the correct version, compiles and renders the template, and returns the fully rendered content.
6. **Variable Auto-Detection:** Automatically parses Handlebars templates to detect all referenced variables (`{{var}}`), block helpers (`{{#if var}}`), and iteration contexts (`{{#each var}}`). Detected variables are stored in the `template_variables` table for documentation and validation.
7. **Template Preview & Testing:** Endpoints to preview a rendered template with sample data and validate template syntax without creating a notification.
8. **Asynchronous Audit Logging:** All template lifecycle events (created, updated, version created, rendered) are published to RabbitMQ as fire-and-forget messages. No synchronous writes for audit logging — the Audit Service consumes and persists these messages independently.

> **Info:** **Handlebars Template Engine**
>
> The Template Service uses [Handlebars.js](https://handlebarsjs.com/) as its rendering engine. Handlebars provides logic-less templates with a simple `{{variable}}` syntax, conditional blocks (`{{#if}}`, `{{#unless}}`), iteration (`{{#each}}`), and partials. The service registers custom helpers for common formatting needs and pre-compiles templates into an in-memory cache for high-performance rendering.

---

## 2. Architecture & Integration Points

The Template Service sits alongside the notification pipeline as a synchronous rendering dependency. The Notification Engine calls it during the rendering phase to produce channel-specific content from templates and event data. The service owns its own PostgreSQL schema for template storage and publishes audit events asynchronously to RabbitMQ.

### Upstream & Downstream Dependencies

| Direction | System | Protocol | Description |
|---|---|---|---|
| **Inbound** | Notification Engine | HTTP/REST (sync) | Calls `POST /templates/:id/render` to render a template for a specific channel with event payload as variable data |
| **Inbound** | Admin Service (via Gateway) | HTTP/REST (sync) | Template CRUD operations, preview, and management queries proxied through the Notification Gateway |
| **Downstream** | Audit Service | RabbitMQ (AMQP) | Publishes template lifecycle events (fire-and-forget) to `xch.notifications.status` exchange |

### Figure 2.1 — Integration Context

```
┌──────────────────────────┐
│  Admin UI :3159           │
│  /templates page          │
└───────────┬──────────────┘
            │ HTTP (CRUD, preview)
            ▼
┌──────────────────────────┐
│  Notification Gateway    │
│  :3150 (BFF)             │
│  Auth · Rate Limit       │
└───────────┬──────────────┘
            │ HTTP proxy
            ▼
┌──────────────────────────────────────────────────────────────┐
│                   Template Service :3153                       │
│                                                               │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Template   │  │  Handlebars  │  │  Version              │ │
│  │  CRUD       │  │  Renderer    │  │  Manager              │ │
│  │  (REST)     │  │  (Compiler)  │  │  (Immutable Versions) │ │
│  └────────────┘  └──────┬───────┘  └───────────────────────┘ │
│                         │                                     │
│  PostgreSQL: template_service                                 │
└─────────────────────────┼─────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
┌──────────────────────┐  ┌─────────────────────────────┐
│  Notification Engine │  │  xch.notifications.status   │
│  :3152               │  │  (RabbitMQ Exchange)        │
│                      │  │                             │
│  POST /templates/    │  │  Fire-and-forget audit      │
│  :id/render          │  │  messages                   │
│  (sync caller)       │  └──────────────┬──────────────┘
└──────────────────────┘                 │
                                         ▼
                            ┌─────────────────────────┐
                            │  Audit Service :3156     │
                            │  Consumes & persists     │
                            └─────────────────────────┘
```

### Communication Patterns

| Pattern | Usage | Justification |
|---|---|---|
| **Synchronous HTTP (inbound)** | Render requests from Notification Engine (`POST /templates/:id/render`) | The Notification Engine needs the rendered content synchronously to assemble the dispatch payload before publishing to the Channel Router |
| **Synchronous HTTP (inbound)** | Template CRUD from Admin Service (via Gateway) | Admin users need immediate feedback when creating, editing, or previewing templates |
| **Asynchronous RabbitMQ** | Audit logging (template lifecycle events) | Logging must never block the rendering pipeline; fire-and-forget ensures zero overhead on the critical path |

> **Info:** **Why Synchronous Rendering?**
>
> The Notification Engine calls the Template Service synchronously (HTTP) rather than publishing a render request to RabbitMQ. This is because the Engine needs the rendered content immediately to assemble the complete dispatch message (rendered body + metadata + media references) before publishing it to the Channel Router. An asynchronous render would add complexity (callback correlation, partial message assembly) without meaningful throughput benefit — template rendering is a sub-millisecond operation once the template is compiled and cached.

---

## 3. Template Lifecycle & Structure

### 3.1 Data Model

Each template is a logical entity identified by a unique `slug` (e.g., `order-shipped`). Templates contain one or more **channel variants** — each channel (email, SMS, WhatsApp, push) has its own content body, subject line (where applicable), and metadata. Templates are organized into **versions** — every edit creates a new immutable version, preserving the complete history.

| Concept | Description | Example |
|---|---|---|
| **Template** | Logical entity with slug, name, description | `order-shipped` — "Order Shipped Confirmation" |
| **Version** | Immutable snapshot of all channel content at a point in time | Version 3 — created 2026-02-20 by admin-user |
| **Channel Variant** | Channel-specific content within a version | Email: HTML body + subject; SMS: plain text body |
| **Variable** | Dynamic placeholder detected in template content | `{{customerName}}`, `{{items}}`, `{{trackingUrl}}` |

### 3.2 Multi-Channel Content Specifications

| Channel | Fields | Constraints |
|---|---|---|
| **Email** | `subject` (Handlebars), `body` (HTML + Handlebars) | No hard body size limit; subject recommended ≤ 150 chars |
| **SMS** | `body` (plain text + Handlebars) | Rendered output ≤ 160 characters (single segment) or ≤ 1600 characters (multi-segment, 10 segments max) |
| **WhatsApp** | `body` (plain text + Handlebars with WhatsApp formatting: `*bold*`, `_italic_`) | Rendered output ≤ 4096 characters (WhatsApp Business API limit) |
| **Push** | `title` (Handlebars), `body` (Handlebars), `data` (JSON key-value pairs) | Title + body combined ≤ 256 characters; `data` payload ≤ 4 KB |

### 3.3 Variable Auto-Detection

When a template is created or updated, the service automatically parses all channel variant bodies to detect referenced variables. The detection algorithm:

1. Parse all Handlebars expressions across all channel bodies in the version.
2. Extract simple variables (`{{customerName}}`), block contexts (`{{#if trackingUrl}}` → `trackingUrl`), and iteration variables (`{{#each items}}` → `items`).
3. Deduplicate across channels — a variable referenced in both email and SMS is stored once.
4. Upsert detected variables into the `template_variables` table with `is_required = false` by default.
5. Preserve any existing `description`, `default_value`, and `is_required` overrides set by admins.

### 3.4 Custom Handlebars Helpers

The service registers the following custom helpers at startup:

| Helper | Signature | Description | Example |
|---|---|---|---|
| `formatCurrency` | `{{formatCurrency amount code}}` | Locale-aware currency formatting | `{{formatCurrency 79.99 "USD"}}` → `$79.99` |
| `formatDate` | `{{formatDate date pattern}}` | Date formatting with dayjs | `{{formatDate timestamp "MMM DD, YYYY"}}` → `Feb 20, 2026` |
| `uppercase` | `{{uppercase text}}` | Convert to uppercase | `{{uppercase status}}` → `SHIPPED` |
| `lowercase` | `{{lowercase text}}` | Convert to lowercase | `{{lowercase channel}}` → `email` |
| `truncate` | `{{truncate text length}}` | Safe text truncation with ellipsis | `{{truncate description 50}}` → `Wireless Headph...` |
| `eq` | `{{#if (eq status "shipped")}}` | Equality comparison for conditionals | Renders block if values are equal |
| `gt` | `{{#if (gt totalAmount 100)}}` | Greater-than comparison | Renders block if first > second |
| `default` | `{{default customerName "Valued Customer"}}` | Fallback value for missing variables | Uses second arg if first is null/undefined |

### Figure 3.1 — Template Creation Pipeline

```
    ┌─────────────────────────┐
    │  Receive POST /templates │  ◄── JSON body with slug, name, channels
    └────────────┬────────────┘
                 ▼
     ◆ Slug unique?             ◆────── No ──▶ [409 Conflict]
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  Validate Handlebars     │  ◄── Compile each channel body
    │  syntax (all channels)   │
    └────────────┬────────────┘
                 ▼
     ◆ Syntax valid?            ◆────── No ──▶ [400: Template syntax error]
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  Auto-detect variables   │  ◄── Parse {{var}}, {{#if}}, {{#each}}
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  Create template record  │  ◄── INSERT into templates table
    │  Create version 1        │      INSERT into template_versions
    │  Create channel variants │      INSERT into template_channels
    │  Create variables        │      INSERT into template_variables
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  Compile & cache         │  ◄── Pre-compile Handlebars, add to cache
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  Publish audit event     │  ◄── Fire-and-forget to RabbitMQ
    │  (template.template.     │
    │   created)               │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  Return 201 Created      │  ──▶ { id, slug, version: 1, variables }
    └─────────────────────────┘
```

---

## 4. Template Rendering Pipeline

The rendering pipeline is the hot path of the Template Service — invoked synchronously by the Notification Engine for every notification across every channel. The pipeline is optimized for speed through pre-compiled template caching and version resolution.

### 4.1 Render Flow (9 Steps)

1. **Receive Render Request:** Accept `POST /templates/:id/render` with `channel`, `data` (variable payload), and optional `versionNumber` in the request body.
2. **Template Lookup:** Fetch the template record by ID (or slug). Verify the template exists and `is_active = true`.
3. **Version Resolution:** If `versionNumber` is specified, use that exact version. Otherwise, resolve to the template's `current_version_id` (latest active version).
4. **Cache Lookup:** Check the in-memory compiled template cache for key `{templateId}:{versionId}:{channel}`. If found, skip to step 7.
5. **Channel Content Fetch:** Load the `template_channels` row for `(template_version_id, channel)`. If no content exists for the requested channel, return `404`.
6. **Compile Template:** Compile the Handlebars template body (and subject, if applicable) into executable functions. Store compiled functions in the in-memory cache.
7. **Variable Validation:** Compare provided `data` keys against the template's declared required variables (`is_required = true` in `template_variables`). Log a warning for missing optional variables but do not fail.
8. **Handlebars Execute:** Execute the compiled template function with the provided `data` object. Custom helpers are available during execution. Handlebars auto-escapes HTML entities by default (use `{{{triple}}}` for raw HTML).
9. **Output Limits Check:** Validate the rendered output against channel-specific limits (SMS: 1600 chars, WhatsApp: 4096 chars, push: 256 chars title+body). If exceeded, truncate with a warning in the response metadata.

### Figure 4.1 — Rendering Pipeline

```
    ┌─────────────────────────┐
    │  1. Receive Render       │  ◄── POST /templates/:id/render
    │     Request              │      { channel, data, versionNumber? }
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  2. Template Lookup      │  ◄── Fetch by ID/slug, verify active
    └────────────┬────────────┘
                 ▼
     ◆ Template exists &       ◆────── No ──▶ [404 Not Found]
     ◆ is_active?              ◆
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  3. Version Resolution   │  ◄── Explicit version or current_version_id
    └────────────┬────────────┘
                 ▼
     ◆ 4. Cache hit?           ◆────── Yes ──▶ [Skip to step 7]
                 │
                 No
                 ▼
    ┌─────────────────────────┐
    │  5. Channel Content      │  ◄── Load template_channels row
    │     Fetch                │
    └────────────┬────────────┘
                 ▼
     ◆ Channel content exists? ◆────── No ──▶ [404: Channel not configured]
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  6. Compile Template     │  ◄── Handlebars.compile(body)
    │     Store in cache       │      Cache key: {tplId}:{verN}:{ch}
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  7. Variable Validation  │  ◄── Check required vars present
    └────────────┬────────────┘
                 ▼
     ◆ Required vars missing?  ◆────── Yes ──▶ [400: Missing variables]
                 │
                 No
                 ▼
    ┌─────────────────────────┐
    │  8. Handlebars Execute   │  ◄── Run compiled fn with data
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  9. Output Limits Check  │  ◄── Channel-specific size validation
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  Return 200 OK           │  ──▶ { rendered: { subject?, body }, warnings[] }
    └─────────────────────────┘
```

---

## 5. Template Versioning

### 5.1 Immutable Version Model

Template versioning follows an append-only, immutable model. Every modification to a template's content creates a new version — existing versions are never modified. This guarantees that notifications already queued for delivery will render with the exact content that was active when the notification was created, even if the template is updated before delivery occurs.

| Principle | Description |
|---|---|
| **Append-Only** | New versions are always created; existing rows in `template_versions` and `template_channels` are never updated |
| **Immutable Snapshots** | Each version captures the complete state of all channel variants at that point in time |
| **Current Version Pointer** | The `templates.current_version_id` column points to the latest active version; the Notification Engine uses this by default |
| **Version Pinning** | The Notification Engine may specify an explicit `versionNumber` in the render request to use a specific historical version |
| **No Deletion** | Versions cannot be deleted — only the parent template can be soft-deleted (`is_active = false`) |

### 5.2 Version Creation on Update

When a template is updated via `PUT /templates/:id`:

1. Validate the incoming channel content (Handlebars syntax check on all channel bodies).
2. Create a new `template_versions` row with `version_number = previous + 1` and the provided `change_summary`.
3. Create new `template_channels` rows for each channel in the update, linked to the new version.
4. Re-run variable auto-detection on the new version's content.
5. Update the `templates.current_version_id` pointer to the new version.
6. Invalidate the compiled template cache entries for the old version (if cached).
7. Publish a `template.template.updated` audit event (fire-and-forget).

### 5.3 Rollback

Rolling back a template to a previous version is achieved by updating the `templates.current_version_id` pointer to an older version's ID. The old version's content remains intact (immutable). This is an administrative operation exposed via the Admin Service.

### Figure 5.1 — Template Update with Version Creation

```
Admin UI            Gateway            Template Service         PostgreSQL
   │                   │                      │                       │
   │  PUT /templates/  │                      │                       │
   │  :id              │                      │                       │
   │  { channels,      │                      │                       │
   │    changeSummary } │                      │                       │
   │──────────────────▶│                      │                       │
   │                   │  Proxy PUT           │                       │
   │                   │─────────────────────▶│                       │
   │                   │                      │  Validate Handlebars  │
   │                   │                      │  syntax               │
   │                   │                      │                       │
   │                   │                      │  BEGIN transaction    │
   │                   │                      │──────────────────────▶│
   │                   │                      │                       │
   │                   │                      │  INSERT new version   │
   │                   │                      │  (version_number + 1) │
   │                   │                      │──────────────────────▶│
   │                   │                      │                       │
   │                   │                      │  INSERT channel       │
   │                   │                      │  variants (new ver)   │
   │                   │                      │──────────────────────▶│
   │                   │                      │                       │
   │                   │                      │  Auto-detect vars     │
   │                   │                      │  UPSERT variables     │
   │                   │                      │──────────────────────▶│
   │                   │                      │                       │
   │                   │                      │  UPDATE templates     │
   │                   │                      │  SET current_version  │
   │                   │                      │──────────────────────▶│
   │                   │                      │                       │
   │                   │                      │  COMMIT               │
   │                   │                      │──────────────────────▶│
   │                   │                      │                       │
   │                   │                      │  Invalidate cache     │
   │                   │                      │  (old version entries) │
   │                   │                      │                       │
   │                   │                      │  Publish audit event  │
   │                   │                      │  (fire-and-forget)    │
   │                   │                      │                       │
   │                   │  200 OK              │                       │
   │                   │  { version: N+1 }    │                       │
   │                   │◄─────────────────────│                       │
   │  200 OK           │                      │                       │
   │◄──────────────────│                      │                       │
```

---

## 6. Template Caching Strategy

The Template Service maintains an in-memory cache of pre-compiled Handlebars template functions. This eliminates repeated compilation on the rendering hot path — the Handlebars `compile()` step is expensive relative to executing an already-compiled function.

### 6.1 Cache Structure

| Property | Value |
|---|---|
| **Cache Type** | In-memory `Map` (per-instance) |
| **Cache Key** | `{templateId}:{versionId}:{channel}` |
| **Cache Value** | Compiled Handlebars function (subject + body) |
| **Eviction** | LRU with configurable max size (`TEMPLATE_CACHE_MAX_SIZE`, default: 1000) |
| **TTL** | None — entries are evicted only by LRU or explicit invalidation |

### 6.2 Cache Warm-Up

On startup, the service pre-compiles and caches the current version of all active templates:

```sql
SELECT tv.id AS version_id, tc.channel, tc.subject, tc.body, t.id AS template_id
FROM template_service.templates t
JOIN template_service.template_versions tv ON tv.id = t.current_version_id
JOIN template_service.template_channels tc ON tc.template_version_id = tv.id
WHERE t.is_active = true;
```

This ensures the first render request for any active template is served from cache, avoiding a cold-start penalty.

### 6.3 Cache Invalidation

Cache entries are invalidated in the following scenarios:

| Trigger | Action |
|---|---|
| **Template Updated** (new version created) | Invalidate all entries for the previous version of that template |
| **Template Deactivated** (`is_active = false`) | Remove all entries for that template |
| **Template Deleted** | Remove all entries for that template |
| **Manual Flush** | Admin endpoint to clear the entire cache (operational recovery) |

### 6.4 Multi-Instance Considerations

Each service instance maintains its own independent in-memory cache. In a multi-instance deployment:

- **Cache coherence:** Each instance warms its cache on startup independently. When a template is updated, only the instance that handled the update request invalidates its cache immediately. Other instances will compile the new version on their next render request (lazy refresh).
- **No cross-instance invalidation:** The in-memory cache does not use distributed invalidation by default. This is acceptable because template updates are infrequent (operational changes, not per-request) and the cache miss cost is a single `compile()` call (~1-5ms).
- **Scaling threshold:** For deployments with 3+ instances where cache coherence latency matters, consider adding a Redis-based shared cache layer (see [Section 7](#7-performance-evaluation-postgresql-vs-nosql) for the Redis evaluation).

---

## 7. Performance Evaluation: PostgreSQL vs NoSQL

This section evaluates whether alternative storage technologies (DynamoDB, MongoDB, Redis) would provide meaningful performance benefits over the current PostgreSQL-based architecture for the Template Service.

### 7.1 Workload Characteristics

| Characteristic | Value |
|---|---|
| **Table Size** | ~100-500 rows (templates), ~500-2000 rows (versions) |
| **Write Pattern** | Low-frequency admin operations (template CRUD) |
| **Read Pattern** | High-frequency render requests — but served from in-memory cache, not DB |
| **Data Model** | Relational (template → versions → channels → variables) |
| **Query Patterns** | PK lookups, version history, channel content joins |
| **Hot Path** | Compiled template cache (in-memory) — DB is not on the hot path |

### 7.2 DynamoDB Assessment

| Criterion | Rating | Notes |
|---|---|---|
| **Data Model Fit** | Poor | Template data is inherently relational (4 tables with FK relationships). DynamoDB's single-table design would require denormalization that adds complexity without benefit at this scale. |
| **Query Flexibility** | Poor | Version history queries, channel-specific lookups, and variable joins are natural in SQL but require GSIs and complex access patterns in DynamoDB. |
| **Performance** | Neutral | DynamoDB single-digit-ms reads would not improve on PostgreSQL for a ~500-row table. The in-memory cache already eliminates the DB from the hot path. |
| **Operational Complexity** | High | Adds a new technology to the stack (all other services use PostgreSQL). Requires IAM roles, capacity planning, and DynamoDB-specific monitoring. |
| **Cost** | Higher | On-demand pricing for a low-volume table adds cost without value. PostgreSQL is already provisioned for other services. |

**Verdict:** Not recommended. Poor data model fit, high operational overhead, no performance benefit.

### 7.3 MongoDB Assessment

| Criterion | Rating | Notes |
|---|---|---|
| **Data Model Fit** | Moderate | Template-as-document (embedding channels and variables) is a natural fit for MongoDB. However, PostgreSQL's JSONB column handles flexible metadata equally well. |
| **Query Flexibility** | Good | Rich query language, but the Template Service's query patterns are simple PK lookups and joins — not complex aggregations where MongoDB excels. |
| **Performance** | Neutral | No measurable improvement over PostgreSQL at this data volume. In-memory cache dominates performance. |
| **Operational Complexity** | High | Adds MongoDB to the operational stack (replica sets, WiredTiger tuning, backup strategy). All other services use PostgreSQL. |
| **Cost** | Higher | Separate MongoDB cluster for a single low-volume service is unjustified. |

**Verdict:** Moderate data model fit, but adds unjustified operational complexity. PostgreSQL JSONB handles the same flexible metadata needs.

### 7.4 Redis Assessment

| Criterion | Rating | Notes |
|---|---|---|
| **Data Model Fit** | Poor (as primary store) | Redis is not suitable as the primary template store — no relational queries, no ACID transactions for version management. |
| **Cache Layer Fit** | Good | Redis excels as a shared cache layer for pre-compiled template data across multiple service instances. |
| **Performance** | Good (cache) | Sub-millisecond reads from a shared cache. Eliminates cache coherence issues in multi-instance deployments. |
| **Operational Complexity** | Low-Moderate | Redis is a common infrastructure component. If already deployed for other services, the incremental cost is minimal. |
| **Scaling Threshold** | 3+ instances | The in-memory cache works well for 1-2 instances. At 3+ instances, Redis provides cache coherence without the lazy-refresh latency. |

**Verdict:** Viable as a shared cache layer (not primary store) when scaling to 3+ instances.

### 7.5 Recommendation Matrix

| Technology | Recommended | Condition |
|---|---|---|
| **PostgreSQL (current)** | Yes | Default choice. Proven, relational data model, already provisioned, in-memory cache handles hot path. |
| **DynamoDB** | No | Poor data model fit, adds operational complexity, no performance benefit at this scale. |
| **MongoDB** | No | Moderate fit but unjustified complexity for a single low-volume service. |
| **Redis (cache layer)** | Conditional | Add when scaling to 3+ Template Service instances where cache coherence latency exceeds acceptable thresholds. |

> **Info:** **Decision Summary**
>
> Keep PostgreSQL as the primary store. The in-memory compiled template cache eliminates the database from the rendering hot path entirely — the bottleneck is Handlebars execution (~0.1-0.5ms), not storage latency. Only add Redis as a shared cache layer when deploying 3+ instances and observing cache-miss-related latency spikes during template updates.

---

## 8. RabbitMQ Topology (Async Audit Logging)

The Template Service uses RabbitMQ exclusively for fire-and-forget audit logging. All audit-relevant events (template created, updated, version created, render executed) are published asynchronously. The Audit Service consumes and persists these messages independently — the Template Service never waits for acknowledgment.

### 8.1 Design Principle: Send and Forget

Writing audit log entries synchronously during template rendering would add latency to the rendering hot path — unacceptable since the Notification Engine calls the Template Service synchronously. Instead, the Template Service publishes lightweight audit messages at key lifecycle points. These messages are:

- **Non-blocking:** Published with `{ mandatory: false }` — if the message cannot be routed, it is silently discarded.
- **Fire-and-forget:** The service does not wait for consumer acknowledgment. Publishing failures are logged locally but do not interrupt operations.
- **Idempotent:** Each message includes an `eventId` (UUID) so the Audit Service can deduplicate if a message is delivered more than once.

### 8.2 Exchange & Routing

| Exchange | Type | Routing Key | Purpose |
|---|---|---|---|
| `xch.notifications.status` | Topic | `template.template.created` | New template created |
| `xch.notifications.status` | Topic | `template.template.updated` | Template updated (new version created) |
| `xch.notifications.status` | Topic | `template.template.deleted` | Template soft-deleted (deactivated) |
| `xch.notifications.status` | Topic | `template.template.rolledback` | Template rolled back to previous version |
| `xch.notifications.status` | Topic | `template.render.completed` | Template rendered successfully |
| `xch.notifications.status` | Topic | `template.render.failed` | Template render failed (syntax error, missing vars) |

### 8.3 Message Schema

All messages published to RabbitMQ follow a common envelope:

```json
{
  "eventId": "uuid-v4",
  "source": "template-service",
  "type": "template.template.updated",
  "timestamp": "2026-02-21T10:30:00.000Z",
  "data": {
    "templateId": "tpl-uuid",
    "slug": "order-shipped",
    "versionNumber": 4,
    "changeSummary": "Updated email subject line",
    "updatedBy": "admin-user-uuid",
    "channels": ["email", "sms", "whatsapp", "push"]
  }
}
```

### Figure 8.1 — Async Audit Logging Topology

```
┌──────────────────────────────────────┐
│       Template Service :3153          │
│                                       │
│  Template CRUD / Render Pipeline      │
│  ┌────────────────────────┐          │
│  │ Template created/      │          │
│  │ updated/rendered       │          │
│  └──────┬─────────────────┘          │
│         │                            │
│         ▼                            │
│  ┌────────────────────────┐          │
│  │  Publish to             │  Fire-  │
│  │  xch.notifications.     │  and-   │
│  │  status exchange        │  forget │
│  └──────┬─────────────────┘          │
│         │  (non-blocking)            │
└─────────┼────────────────────────────┘
          │
          ▼
┌──────────────────────────────┐
│  xch.notifications.status    │
│  (Topic Exchange)            │
│                              │
│  Routing keys:               │
│  template.template.*         │
│  template.render.*           │
└───────────────┬──────────────┘
                │
                ▼
   ┌─────────────────────────┐
   │  q.audit.template        │  ◄── Bound: template.#
   │  (1 consumer)            │
   └────────────┬────────────┘
                │
                ▼
   ┌─────────────────────────┐
   │  Audit Service :3156     │
   │  Persist audit events    │
   └─────────────────────────┘
```

> **Warning:** **Message Loss Tolerance**
>
> Because audit messages are fire-and-forget, there is a small possibility of message loss during RabbitMQ restarts or network partitions. This is an acceptable trade-off: the authoritative template state lives in the Template Service's own PostgreSQL database (`templates`, `template_versions`, `template_channels`, `template_variables` tables). The audit messages provide supplementary observability and compliance logging, not the system of record.

---

## 9. REST API Endpoints

### POST /templates

Create a new template with channel variants.

#### Request Body

```json
{
  "slug": "order-shipped",
  "name": "Order Shipped Confirmation",
  "description": "Sent to customers when their order has been dispatched",
  "channels": {
    "email": {
      "subject": "Your order {{orderNumber}} has been shipped!",
      "body": "<html><body><h1>Hi {{customerName}},</h1><p>Great news! Your order <strong>{{orderNumber}}</strong> has been shipped.</p>{{#if trackingUrl}}<p><a href=\"{{trackingUrl}}\">Track your package</a></p>{{/if}}</body></html>"
    },
    "sms": {
      "body": "Hi {{customerName}}, your order {{orderNumber}} has been shipped! {{#if trackingUrl}}Track it: {{trackingUrl}}{{/if}}"
    },
    "whatsapp": {
      "body": "Hello {{customerName}}! Your order *{{orderNumber}}* is on its way. {{#if trackingUrl}}Track here: {{trackingUrl}}{{/if}}"
    },
    "push": {
      "title": "Order Shipped",
      "body": "Your order {{orderNumber}} is on its way!",
      "data": { "orderId": "{{orderId}}", "action": "open_order_tracking" }
    }
  }
}
```

#### Validation Rules

| Field | Rule | Error |
|---|---|---|
| `slug` | Required, unique, lowercase alphanumeric + hyphens, 3-100 chars | `400` / `409 Conflict` |
| `name` | Required, 1-255 chars | `400` |
| `channels` | At least one channel required | `400` |
| `channels.{ch}.body` | Required per channel, valid Handlebars syntax | `400` |
| `channels.email.subject` | Required for email channel | `400` |

#### Responses

| Status | Description |
|---|---|
| `201 Created` | Template created with version 1 |
| `400 Bad Request` | Validation error (missing fields, invalid Handlebars syntax) |
| `409 Conflict` | Slug already exists |

### GET /templates

List all templates with pagination and filtering.

#### Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `channel` | string | — | Filter by channel (`email`, `sms`, `whatsapp`, `push`) |
| `isActive` | boolean | — | Filter by active status |
| `search` | string | — | Search by name or slug (case-insensitive) |
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Items per page (max 200) |

#### Response (200 OK)

```json
{
  "data": [
    {
      "id": "uuid",
      "slug": "order-shipped",
      "name": "Order Shipped Confirmation",
      "description": "Sent to customers when their order has been dispatched",
      "currentVersion": 3,
      "isActive": true,
      "channels": ["email", "sms", "whatsapp", "push"],
      "createdAt": "2026-01-15T10:00:00Z",
      "updatedAt": "2026-02-20T14:30:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 12, "totalPages": 1 }
}
```

### GET /templates/:id

Retrieve full template details including all channel variants, variables, and version history.

#### Response (200 OK)

```json
{
  "id": "uuid",
  "slug": "order-shipped",
  "name": "Order Shipped Confirmation",
  "description": "Sent to customers when their order has been dispatched",
  "currentVersion": 3,
  "isActive": true,
  "channels": {
    "email": { "subject": "Your order {{orderNumber}} has been shipped!", "body": "..." },
    "sms": { "body": "Hi {{customerName}}, your order {{orderNumber}} has been shipped!..." },
    "whatsapp": { "body": "Hello {{customerName}}! Your order *{{orderNumber}}* is on its way..." },
    "push": { "title": "Order Shipped", "body": "Your order {{orderNumber}} is on its way!", "data": {} }
  },
  "variables": [
    { "name": "customerName", "description": "Customer full name", "defaultValue": null, "isRequired": true },
    { "name": "orderNumber", "description": "Order reference number", "defaultValue": null, "isRequired": true },
    { "name": "trackingUrl", "description": "Package tracking URL", "defaultValue": null, "isRequired": false },
    { "name": "orderId", "description": null, "defaultValue": null, "isRequired": false }
  ],
  "versions": [
    { "versionNumber": 3, "changeSummary": "Updated email subject", "createdBy": "admin-user", "createdAt": "2026-02-20T14:30:00Z" },
    { "versionNumber": 2, "changeSummary": "Added WhatsApp channel", "createdBy": "admin-user", "createdAt": "2026-02-10T09:00:00Z" },
    { "versionNumber": 1, "changeSummary": "Initial version", "createdBy": "admin-user", "createdAt": "2026-01-15T10:00:00Z" }
  ]
}
```

### PUT /templates/:id

Update a template. Creates a new immutable version.

#### Request Body

```json
{
  "name": "Order Shipped Confirmation",
  "description": "Updated description",
  "channels": {
    "email": {
      "subject": "Great news — your order {{orderNumber}} shipped!",
      "body": "<html>...</html>"
    },
    "sms": { "body": "..." }
  },
  "changeSummary": "Updated email subject line for better open rates"
}
```

#### Responses

| Status | Description |
|---|---|
| `200 OK` | Template updated, new version created |
| `400 Bad Request` | Validation error (missing `changeSummary`, invalid Handlebars) |
| `404 Not Found` | Template not found or inactive |

### POST /templates/:id/render

Render a template with provided variable data for a specific channel. This is the primary endpoint called by the Notification Engine during notification processing.

#### Request Body

```json
{
  "channel": "email",
  "data": {
    "customerName": "Jane Doe",
    "orderNumber": "ORD-2026-00451",
    "trackingUrl": "https://track.carrier.com/ABC123",
    "items": [
      { "name": "Wireless Headphones", "quantity": 1, "price": 79.99 }
    ],
    "totalAmount": 79.99,
    "currency": "USD"
  },
  "versionNumber": 3
}
```

#### Response (200 OK)

```json
{
  "rendered": {
    "subject": "Great news — your order ORD-2026-00451 shipped!",
    "body": "<html><body><h1>Hi Jane Doe,</h1><p>Great news! Your order <strong>ORD-2026-00451</strong> has been shipped.</p><p><a href=\"https://track.carrier.com/ABC123\">Track your package</a></p></body></html>"
  },
  "metadata": {
    "templateId": "uuid",
    "slug": "order-shipped",
    "versionNumber": 3,
    "channel": "email",
    "renderedAt": "2026-02-20T14:30:00.123Z",
    "renderDurationMs": 2
  },
  "warnings": []
}
```

#### Error Responses

| Status | Description | Body |
|---|---|---|
| `400 Bad Request` | Missing required variables or invalid channel | `{ "error": "Missing required variables", "missing": ["customerName"] }` |
| `404 Not Found` | Template or channel not found | `{ "error": "Template not found" }` |
| `500 Internal Server Error` | Render execution error | `{ "error": "Render failed", "details": "..." }` |

### POST /templates/:id/preview

Preview a template with sample data across all channels. Returns rendered previews without creating a notification.

#### Request Body

```json
{
  "data": {
    "customerName": "Sample Customer",
    "orderNumber": "PREVIEW-001",
    "trackingUrl": "https://example.com/track"
  }
}
```

#### Response (200 OK)

```json
{
  "previews": {
    "email": { "subject": "...", "body": "..." },
    "sms": { "body": "..." },
    "whatsapp": { "body": "..." },
    "push": { "title": "...", "body": "..." }
  },
  "warnings": ["Variable 'items' not provided — rendered as empty"]
}
```

### GET /health

Health check endpoint. Returns service status, database connectivity, cache status, and RabbitMQ connection health.

#### Response (200 OK)

```json
{
  "status": "healthy",
  "uptime": 86400,
  "checks": {
    "database": { "status": "up", "latencyMs": 2 },
    "rabbitmq": { "status": "up", "latencyMs": 5 },
    "cache": {
      "size": 48,
      "maxSize": 1000,
      "hitRate": 0.97
    }
  }
}
```

---

## 10. Database Design

- **Schema:** `template_service`
- **User:** `template_service_user`
- **DB Script:** `template-service/dbscripts/schema-template-service.sql`

### templates Table

Master template records. Each row represents a logical template entity identified by a unique `slug`. The `current_version_id` column points to the latest active version for rendering. This is a low-volume table (~100-500 rows) that serves as the entry point for all template lookups.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Template identifier |
| `slug` | `VARCHAR(100)` | `NOT NULL UNIQUE` | URL-friendly unique identifier |
| `name` | `VARCHAR(255)` | `NOT NULL` | Human-readable template name |
| `description` | `TEXT` | | Template purpose description |
| `current_version_id` | `UUID` | | FK to `template_versions.id` — latest active version |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT true` | Whether the template is active |
| `created_by` | `VARCHAR(100)` | | User who created the template |
| `updated_by` | `VARCHAR(100)` | | User who last updated the template |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_templates_slug` | `slug` | UNIQUE | Slug-based template lookup |
| `idx_templates_is_active` | `is_active` | B-Tree | Filter by active status |

### template_versions Table

Immutable version snapshots. Each row captures a point-in-time state of a template. Versions are append-only — never updated or deleted. The version number is auto-incremented per template. This is a low-to-moderate volume table (~500-2000 rows) that supports version history queries and rollback operations.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Version identifier |
| `template_id` | `UUID` | `NOT NULL REFERENCES templates(id)` | Parent template |
| `version_number` | `INTEGER` | `NOT NULL` | Sequential version number per template |
| `change_summary` | `TEXT` | | Description of what changed in this version |
| `created_by` | `VARCHAR(100)` | | User who created this version |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Version creation timestamp |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_template_versions_template_id` | `template_id` | B-Tree | List versions for a template |
| `idx_template_versions_template_version` | `template_id, version_number` | UNIQUE | Ensure unique version numbers per template |

### template_channels Table

Channel-specific content for each version. Each row stores the rendered template body (and optional subject) for a single channel within a specific version. This is the table queried during the rendering hot path (on cache miss). Volume tracks `template_versions` × number of channels (~2000-8000 rows).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Channel content identifier |
| `template_version_id` | `UUID` | `NOT NULL REFERENCES template_versions(id)` | Parent version |
| `channel` | `VARCHAR(20)` | `NOT NULL` | Channel type: `email`, `sms`, `whatsapp`, `push` |
| `subject` | `TEXT` | | Subject line template (email and push) |
| `body` | `TEXT` | `NOT NULL` | Body template (Handlebars content) |
| `metadata` | `JSONB` | `DEFAULT '{}'` | Channel-specific metadata (e.g., push `data` payload schema) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_template_channels_version_id` | `template_version_id` | B-Tree | List channels for a version |
| `idx_template_channels_version_channel` | `template_version_id, channel` | UNIQUE | Ensure one entry per channel per version |

### template_variables Table

Declared template variables with descriptions and defaults. Auto-detected from Handlebars template content during create/update. Admins can override `description`, `default_value`, and `is_required` via the Admin UI. This is a low-volume reference table (~500-2000 rows) used for documentation, validation, and the Admin UI variable editor.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Variable record identifier |
| `template_id` | `UUID` | `NOT NULL REFERENCES templates(id)` | Parent template |
| `variable_name` | `VARCHAR(100)` | `NOT NULL` | Handlebars variable name |
| `description` | `TEXT` | | Human-readable description of the variable |
| `default_value` | `TEXT` | | Default value used if not provided during render |
| `is_required` | `BOOLEAN` | `NOT NULL DEFAULT false` | Whether the variable must be provided for rendering |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_template_variables_template_id` | `template_id` | B-Tree | List variables for a template |
| `idx_template_variables_template_name` | `template_id, variable_name` | UNIQUE | Ensure unique variable names per template |

### Figure 10.1 — Entity Relationship Diagram

```
┌──────────────────────────────┐
│           templates           │
├──────────────────────────────┤
│ PK  id               UUID    │
│ UK  slug             VARCHAR │
│     name             VARCHAR │
│     description      TEXT    │
│     current_version_id UUID  │──┐
│     is_active        BOOLEAN │  │ (points to latest version)
│     created_by       VARCHAR │  │
│     updated_by       VARCHAR │  │
│     created_at       TSTZ   │  │
│     updated_at       TSTZ   │  │
└──────────┬───────────────────┘  │
           │                      │
           │ template_id          │
           │                      │
     ┌─────┴──────────┐          │
     │                │          │
     ▼                ▼          │
┌──────────────────────────────┐  │
│      template_versions        │◄─┘
├──────────────────────────────┤
│ PK  id               UUID    │
│ FK  template_id      UUID    │
│     version_number   INTEGER │
│     change_summary   TEXT    │
│     created_by       VARCHAR │
│     created_at       TSTZ   │
├──────────────────────────────┤
│ UK  (template_id, version_   │
│      number)                  │
└──────────┬───────────────────┘
           │
           │ template_version_id
           ▼
┌──────────────────────────────┐
│      template_channels        │
├──────────────────────────────┤
│ PK  id               UUID    │
│ FK  template_version_id UUID │
│     channel          VARCHAR │
│     subject          TEXT    │
│     body             TEXT    │
│     metadata         JSONB  │
│     created_at       TSTZ   │
├──────────────────────────────┤
│ UK  (template_version_id,    │
│      channel)                 │
└──────────────────────────────┘

┌──────────────────────────────┐
│      template_variables       │
├──────────────────────────────┤
│ PK  id               UUID    │
│ FK  template_id      UUID    │◄── templates.id
│     variable_name    VARCHAR │
│     description      TEXT    │
│     default_value    TEXT    │
│     is_required      BOOLEAN │
│     created_at       TSTZ   │
│     updated_at       TSTZ   │
├──────────────────────────────┤
│ UK  (template_id,            │
│      variable_name)           │
└──────────────────────────────┘
```

### Growth Estimates

| Table | Estimated Rows (Year 1) | Estimated Size | Growth Rate |
|---|---|---|---|
| `templates` | 100-500 | ~1 MB | Very low (~1-5 new templates/month) |
| `template_versions` | 500-2,000 | ~5 MB | Low (~2-5 versions/template/month) |
| `template_channels` | 2,000-8,000 | ~20 MB | Tracks versions × channels |
| `template_variables` | 500-2,000 | ~2 MB | Tracks templates × variables |
| **Total** | — | **~28 MB** | **~500 MB max projected** |

> **Info:** **No Data Retention Policy Required**
>
> Unlike the Event Ingestion Service (which purges large JSONB payloads) and the Bulk Upload Service (which deletes old uploads), the Template Service retains all data indefinitely. The total projected storage (~500 MB max) is negligible. Template versions are never deleted — they serve as an immutable audit trail and enable version-pinned rendering for in-flight notifications.

---

## 11. Media & Attachments in Templates

### 11.1 Inline Media Rendering

Templates reference inline media through the event's business fields (e.g., product images via `items[].imageUrl`), not through the `media` array directly. The `media` array on the canonical event is consumed by the Channel Router for attachment handling — the Template Service does not process `media` entries.

```handlebars
{{!-- Email template with product images --}}
<table>
  {{#each items}}
  <tr>
    <td>{{#if imageUrl}}<img src="{{imageUrl}}" alt="{{name}}" width="80">{{/if}}</td>
    <td>{{name}} x{{quantity}} — {{formatCurrency price ../currency}}</td>
  </tr>
  {{/each}}
</table>
```

### 11.2 Media Pass-Through to Channel Router

The Template Service renders template content only — it does not download, process, or validate media assets. The rendering output (subject + body) is returned to the Notification Engine, which assembles the complete dispatch message including the `media` array pass-through to the Channel Router. The Channel Router then handles channel-specific media delivery (email attachments, WhatsApp media messages, push images).

| Concern | Responsible Service | Description |
|---|---|---|
| **Inline image references in templates** | Template Service | Renders `<img src="{{imageUrl}}">` tags using event data |
| **Media attachment delivery** | Channel Router | Downloads and attaches `context: "attachment"` media from URLs |
| **WhatsApp rich media** | Channel Router | Sends media message types via Twilio `MediaUrl` |
| **Push notification images** | Channel Router | Maps first image to FCM `notification.image` |

> **Info:** **Separation of Concerns**
>
> The Template Service is intentionally media-agnostic. It renders text content (HTML, plain text) using Handlebars variables — if the event data includes image URLs, they are rendered as text (e.g., in `<img>` tags). The Channel Router is responsible for the binary concerns: downloading attachments, enforcing size limits, and handling provider-specific media APIs. See [02 — Detailed Microservices §5](02-detailed-microservices.md#5-template-service) for the full media handling specification.

---

## 12. Sequence Diagrams

### 12.1 Template Render Flow

```
Notification Engine       Template Service              PostgreSQL          In-Memory Cache
       │                        │                            │                    │
       │  POST /templates/      │                            │                    │
       │  :id/render            │                            │                    │
       │  { channel: "email",   │                            │                    │
       │    data: {...} }       │                            │                    │
       │───────────────────────▶│                            │                    │
       │                        │                            │                    │
       │                        │  Lookup template           │                    │
       │                        │───────────────────────────▶│                    │
       │                        │  Template record           │                    │
       │                        │◄───────────────────────────│                    │
       │                        │                            │                    │
       │                        │  Cache lookup              │                    │
       │                        │  {tplId}:{verN}:{email}    │                    │
       │                        │───────────────────────────────────────────────▶│
       │                        │  Cache HIT                  │                    │
       │                        │◄───────────────────────────────────────────────│
       │                        │                            │                    │
       │                        │  Validate required vars    │                    │
       │                        │  Execute compiled template │                    │
       │                        │  Check output limits       │                    │
       │                        │                            │                    │
       │                        │  Publish audit event       │                    │
       │                        │  (fire-and-forget)         │                    │
       │                        │                            │                    │
       │  200 OK                │                            │                    │
       │  { rendered: {         │                            │                    │
       │      subject, body },  │                            │                    │
       │    metadata, warnings }│                            │                    │
       │◄───────────────────────│                            │                    │
```

### 12.2 Template CRUD Flow (Create)

```
Admin UI            Gateway            Template Service         PostgreSQL
   │                   │                      │                       │
   │  POST /templates  │                      │                       │
   │  { slug, name,    │                      │                       │
   │    channels }     │                      │                       │
   │──────────────────▶│                      │                       │
   │                   │  Proxy POST          │                       │
   │                   │─────────────────────▶│                       │
   │                   │                      │                       │
   │                   │                      │  Check slug unique    │
   │                   │                      │──────────────────────▶│
   │                   │                      │  OK                   │
   │                   │                      │◄──────────────────────│
   │                   │                      │                       │
   │                   │                      │  Validate Handlebars  │
   │                   │                      │  Auto-detect vars     │
   │                   │                      │                       │
   │                   │                      │  BEGIN transaction    │
   │                   │                      │──────────────────────▶│
   │                   │                      │  INSERT template      │
   │                   │                      │  INSERT version 1     │
   │                   │                      │  INSERT channels      │
   │                   │                      │  INSERT variables     │
   │                   │                      │  COMMIT               │
   │                   │                      │──────────────────────▶│
   │                   │                      │                       │
   │                   │                      │  Compile & cache      │
   │                   │                      │  Publish audit event  │
   │                   │                      │  (fire-and-forget)    │
   │                   │                      │                       │
   │                   │  201 Created         │                       │
   │                   │◄─────────────────────│                       │
   │  201 Created      │                      │                       │
   │◄──────────────────│                      │                       │
```

### 12.3 Multi-Channel Parallel Rendering

When the Notification Engine needs to render a template for multiple channels (e.g., an event triggers both email and SMS), it makes separate render calls. The Template Service handles each independently from cache.

```
Notification Engine              Template Service
       │                               │
       │  POST /templates/:id/render   │
       │  { channel: "email", data }   │
       │──────────────────────────────▶│
       │                               │  Cache hit → execute → return
       │  200 OK (email rendered)      │
       │◄──────────────────────────────│
       │                               │
       │  POST /templates/:id/render   │
       │  { channel: "sms", data }     │
       │──────────────────────────────▶│
       │                               │  Cache hit → execute → return
       │  200 OK (sms rendered)        │
       │◄──────────────────────────────│
       │                               │
       │  POST /templates/:id/render   │
       │  { channel: "whatsapp", data }│
       │──────────────────────────────▶│
       │                               │  Cache hit → execute → return
       │  200 OK (whatsapp rendered)   │
       │◄──────────────────────────────│
       │                               │
       │  [Assemble dispatch messages  │
       │   per channel, publish to     │
       │   Channel Router]             │
```

> **Info:** **Sequential vs Parallel Rendering**
>
> The Notification Engine currently renders channels sequentially (one HTTP call at a time) for simplicity. If multi-channel rendering latency becomes a bottleneck, the Engine can issue parallel render requests using `Promise.all()` — each render call is stateless and independent. At typical volumes (~0.5ms per render from cache), sequential rendering adds negligible overhead.

---

## 13. Error Handling

### Error Categories

| Category | HTTP Status | Handling | Retry Policy |
|---|---|---|---|
| **Template Not Found** | 404 | Return error with template ID | No — caller should verify template exists |
| **Channel Not Configured** | 404 | Return error with channel name | No — template does not support this channel |
| **Template Inactive** | 404 | Return error indicating template is deactivated | No — admin must reactivate |
| **Invalid Handlebars Syntax** | 400 | Return compilation error details with line/column | No — template content must be fixed |
| **Missing Required Variables** | 400 | Return list of missing variable names | No — caller must provide required data |
| **Render Execution Error** | 500 | Log error, return generic render failure message | No — likely a template logic error |
| **Slug Conflict** | 409 | Return conflict error with existing slug | No — caller should use a different slug |
| **Database Error** | 500 | Log error, return generic server error | Yes — transient DB errors are retryable |
| **Validation Error** | 400 | Return detailed validation violation list | No — request must be corrected |

### Error Response Format

All error responses follow a consistent JSON structure:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Template validation failed",
  "details": [
    { "field": "channels.email.body", "error": "Invalid Handlebars syntax: unexpected closing tag at line 12" },
    { "field": "slug", "error": "Slug must be lowercase alphanumeric with hyphens" }
  ]
}
```

---

## 14. Security Considerations

### 14.1 Handlebars HTML Escaping

Handlebars auto-escapes HTML entities in `{{variable}}` expressions by default, preventing XSS injection through template variables. Raw (unescaped) output requires explicit triple-stache `{{{variable}}}` syntax.

| Expression | Output | XSS Safe |
|---|---|---|
| `{{customerName}}` | `&lt;script&gt;alert(1)&lt;/script&gt;` | Yes — HTML-escaped |
| `{{{rawHtml}}}` | `<script>alert(1)</script>` | No — raw output |

> **Warning:** **Raw HTML Expressions**
>
> The use of triple-stache `{{{variable}}}` in templates should be restricted to trusted, admin-controlled content only (e.g., pre-formatted HTML snippets stored in the template). Never use raw expressions with user-supplied event data. Template review processes should flag any `{{{ }}}` usage for security review.

### 14.2 Content Sanitization

For email templates, the rendered HTML output is sanitized before delivery to remove potentially dangerous elements:

- `<script>` tags and `javascript:` URLs are stripped
- `on*` event handler attributes (e.g., `onclick`, `onerror`) are removed
- `<iframe>`, `<object>`, `<embed>` tags are stripped
- CSS `expression()` and `url()` with non-HTTPS schemes are removed

### 14.3 Template Access Control (RBAC)

Template operations are authorized through the Gateway's RBAC system:

| Operation | Required Role | Description |
|---|---|---|
| `GET /templates` | `viewer`, `editor`, `admin` | List and view templates |
| `POST /templates` | `editor`, `admin` | Create new templates |
| `PUT /templates/:id` | `editor`, `admin` | Update templates (creates new version) |
| `DELETE /templates/:id` | `admin` | Soft-delete (deactivate) templates |
| `POST /templates/:id/render` | `service` | Internal render endpoint (service-to-service only) |
| `POST /templates/:id/preview` | `editor`, `admin` | Preview with sample data |

---

## 15. Monitoring & Health Checks

### Key Metrics

| Metric | Description | Alert Threshold |
|---|---|---|
| `template_render_total` | Total render requests (by channel, template slug) | — |
| `template_render_duration_ms` | Render latency (p50, p95, p99) | p99 > 10ms |
| `template_render_errors_total` | Total render failures (by error type) | > 5/min |
| `template_cache_hit_rate` | Compiled template cache hit ratio | < 90% |
| `template_cache_size` | Current number of compiled templates in cache | — |
| `template_cache_evictions_total` | LRU cache evictions | > 50/hour |
| `template_crud_total` | Template create/update/delete operations | — |
| `template_version_created_total` | New template versions created | — |
| `template_audit_publish_failures_total` | Failed fire-and-forget audit message publishes | > 10/hour |
| `template_service_pool_active` | Active database connections | > 80% of pool |

### Health Check

The `GET /health` endpoint verifies:

1. **Database Connectivity:** Executes a lightweight query (`SELECT 1`) and reports latency.
2. **RabbitMQ Connection:** Verifies the AMQP connection is active for audit message publishing.
3. **Cache Status:** Reports cache size, max size, and hit rate.

### Structured Logging

All log entries use structured JSON format:

```json
{
  "timestamp": "2026-02-21T10:30:00.123Z",
  "level": "info",
  "service": "template-service",
  "templateId": "uuid",
  "slug": "order-shipped",
  "channel": "email",
  "versionNumber": 3,
  "message": "Template rendered successfully",
  "durationMs": 1
}
```

---

## 16. Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3153` | HTTP server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `RABBITMQ_URL` | — | RabbitMQ connection string (AMQP) |
| `TEMPLATE_CACHE_MAX_SIZE` | `1000` | Maximum compiled templates in LRU cache |
| `TEMPLATE_CACHE_WARMUP` | `true` | Pre-compile active templates on startup |
| `LOG_LEVEL` | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `RENDER_TIMEOUT_MS` | `5000` | Maximum time for a single render operation |
| `SMS_MAX_LENGTH` | `1600` | Maximum rendered SMS output length (chars) |
| `WHATSAPP_MAX_LENGTH` | `4096` | Maximum rendered WhatsApp output length (chars) |
| `PUSH_MAX_LENGTH` | `256` | Maximum rendered push title+body length (chars) |
| `HEALTH_CHECK_INTERVAL_MS` | `30000` | Health check polling interval |

---

*Notification API Documentation v1.0 -- Architecture Team -- 2026*
