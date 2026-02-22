# 06 — Changelog

**Notification API — Documentation & Feature Change Log**

| | |
|---|---|
| **Version:** | 2.1 |
| **Date:** | 2026-02-21 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

- [About This Changelog](#about-this-changelog)
- [Version 3.2](#version-32--2026-02-21) — Channel Router Service Deep-Dive
- [Version 3.1](#version-31--2026-02-21) — Multi-Item Row Grouping for Bulk Upload Service
- [Version 3.0](#version-30--2026-02-21) — Canonical Schema "Flat" Terminology Clarification
- [Version 2.9](#version-29--2026-02-21) — Template Service Deep-Dive
- [Version 2.8](#version-28--2026-02-21) — Media Schema Extension Across Services
- [Version 2.7](#version-27--2026-02-21) — Default Values for Field Mapping Rules
- [Version 2.6](#version-26--2026-02-21) — Capacity Planning, Media Support, End-to-End Tracing, Table Descriptions
- [Version 2.5](#version-25--2026-02-21) — RabbitMQ Exchange Naming Convention
- [Version 2.4](#version-24--2026-02-20) — Bulk Upload Service Deep-Dive
- [Version 2.3](#version-23--2026-02-20) — Customer Channel Preferences & Critical Channel Overrides
- [Version 2.2](#version-22--2026-02-20) — Notification Engine Service Deep-Dive
- [Version 2.1](#version-21--2026-02-20) — Required cycleId Field
- [Version 2.0](#version-20--2026-02-20) — Events Table DDL & Payload Retention
- [Version 1.9](#version-19--2026-02-20) — Two-Tier Priority Queues (Normal / Critical)
- [Version 1.8](#version-18--2026-02-20) — Eager Mapping Cache with Event-Driven Invalidation
- [Version 1.7](#version-17--2026-02-20) — Generic Source Systems & Runtime Mapping Configuration
- [Version 1.6](#version-16--2026-02-20) — Schema Naming Standardization
- [Version 1.5](#version-15--2026-02-20) — Event Ingestion Service Deep-Dive
- [Version 1.4](#version-14--2026-02-20) — Port Reassignment (3150+)
- [Version 1.3](#version-13--2026-02-19) — Notification Suppression & Deduplication
- [Version 1.2](#version-12--2026-02-19) — Bulk Upload Service
- [Version 1.1](#version-11--2026-02-19) — Authentication, Identity & Testing Strategy
- [Version 1.0](#version-10--2026-02-19) — Initial Documentation Release

---

## About This Changelog

This document tracks all notable changes to the Notification API documentation and feature design. The format follows [Keep a Changelog](https://keepachangelog.com/) conventions.

> **Info:** **Change Types**
>
> Each entry is categorized using one of the following types: **Added**, **Changed**, **Fixed**, **Removed**, **Deprecated**.

---

## Version 3.2 — 2026-02-21

**Channel Router Service Deep-Dive**

Adds a comprehensive standalone deep-dive document for the Channel Router Service. Covers the provider strategy pattern with multi-provider support (SendGrid, Mailgun, Braze, Twilio, FCM), the dumb-pipe integration architecture where all providers receive pre-rendered content from the Template Service, the 7-step delivery pipeline, token bucket rate limiting per provider, circuit breaker state machine with configurable thresholds, retry strategy with exponential backoff and jitter per channel, fallback channel logic, media and attachment handling with channel-specific processing rules, webhook receivers with provider-specific signature verification (ECDSA for SendGrid, HMAC-SHA256 for Mailgun, Twilio Request Validator, Braze API key), Braze user profile synchronization module with inline-on-send strategy and LRU cache, asynchronous audit logging via RabbitMQ fire-and-forget messaging (no synchronous DB writes on the delivery critical path), database design with 4 tables (channels, channel_configs, delivery_attempts, provider_configs), 4 sequence diagrams (standard Mailgun email delivery, Braze multi-channel, retry with circuit breaker trip, fallback channel), provider routing modes (primary, weighted, failover), error handling and dead letter queue, security considerations, monitoring metrics, and configuration. Braze is integrated as a unified multi-channel provider using Pattern A ("Braze as Dumb Pipe") per the architecture team's analysis. Mailgun is integrated as an email delivery transport using pre-rendered HTML, deliberately bypassing Mailgun's server-side Handlebars template system. Existing docs updated with cross-reference callouts, index card, and External Integration Layer provider lists.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | 11 — Channel Router Service Deep-Dive document (MD) with 21 sections covering service overview, architecture & integration points, delivery pipeline, provider strategy pattern, provider adapters (SendGrid, Mailgun, Braze, Twilio SMS, Twilio WhatsApp, FCM), rate limiting, circuit breaker pattern, retry strategy & exponential backoff, fallback channel logic, media & attachment handling, webhook receivers & delivery status, Braze user profile synchronization, RabbitMQ topology, REST API endpoints, database design, asynchronous audit logging, sequence diagrams, error handling, security considerations, monitoring & health checks, and configuration | 11-channel-router-service |
| **Added** | Provider strategy pattern with `ProviderStrategy` interface — enables provider portability, multi-provider support per channel, and routing modes (primary, weighted, failover) | 11-channel-router-service |
| **Added** | Mailgun email provider adapter — dumb pipe integration using `mailgun.js` SDK, multipart/form-data API, HMAC-SHA256 webhook verification, auto-throttling advantage, and built-in soft bounce retry | 11-channel-router-service |
| **Added** | Braze multi-channel provider adapter (email, SMS, WhatsApp, push) — Pattern A dumb pipe integration via `/messages/send` with inline pre-rendered content, user profile sync module, transactional postbacks for email, Braze Currents for other channels | 11-channel-router-service |
| **Added** | Braze user profile synchronization module — inline-on-send strategy with LRU cache (TTL-based), `/users/track` API calls, separate rate limiter (3,000 req/3 sec) | 11-channel-router-service |
| **Added** | Token bucket rate limiting — per-provider rate limits (SendGrid 100/sec, Mailgun 50/sec, Braze 69/sec, Twilio SMS 30/sec, Twilio WhatsApp 80/sec, FCM 500/sec) | 11-channel-router-service |
| **Added** | Circuit breaker state machine — CLOSED/OPEN/HALF_OPEN with configurable failure threshold, cooldown, and success threshold; integration with provider failover routing | 11-channel-router-service |
| **Added** | Asynchronous audit logging — fire-and-forget pattern for all delivery attempt records and status transitions; no synchronous database writes on delivery critical path | 11-channel-router-service |
| **Added** | 4 sequence diagrams: standard Mailgun email delivery with webhook correlation, Braze multi-channel (email + push) with profile sync, retry with circuit breaker trip, fallback channel flow | 11-channel-router-service |
| **Added** | Webhook receivers for 4 providers with provider-specific signature verification and event status mapping table | 11-channel-router-service |
| **Added** | 15 monitoring metrics (delivery counters, duration histograms, circuit breaker state, rate limit wait, fallback triggers, media failures, Braze profile sync, queue depth) | 11-channel-router-service |
| **Added** | Documentation card for doc 11 added to hub page | index |
| **Added** | Cross-reference callout added after Channel Router Service section linking to the new deep-dive document | 02-detailed-microservices |
| **Added** | Cross-reference callout added after entity relationships section linking to channel_router_service design | 03-system-architecture |
| **Changed** | External Integration Layer in architecture diagrams updated to include Mailgun and Braze alongside SendGrid, Twilio, and FCM | 03-system-architecture |
| **Changed** | Index hub page version bumped to 1.9, date updated to 2026-02-21, doc 11 card added | index |
| **Changed** | CLAUDE.md updated with doc 11 in documentation file listing | CLAUDE.md |

---

## Version 3.1 — 2026-02-21

**Multi-Item Row Grouping for Bulk Upload Service**

Adds multi-item row grouping to the Bulk Upload Service, enabling orders with multiple line items to be expressed naturally in flat XLSX spreadsheets. Columns with an `item.*` prefix activate group mode automatically — rows sharing the same group key (`eventType` + configurable column, default `orderId`) are consolidated into a single event with an `items[]` array. Order-level field values are taken from the first row in the group; item-level fields are collected across all rows with the prefix stripped. The feature is fully backward-compatible: files without `item.*` columns process exactly as before (standard mode, one row = one event). Database schema updated with `total_events` column on `uploads` and `group_key` column with partial index on `upload_rows`.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | `total_events` column (`INTEGER`, nullable) on `uploads` table — tracks distinct event count (equals `total_rows` in standard mode, unique group count in group mode) | schema-bulk-upload-service.sql |
| **Added** | `group_key` column (`VARCHAR(500)`, nullable) on `upload_rows` table — stores composite key `{eventType}:{groupKeyValue}` for multi-item row grouping | schema-bulk-upload-service.sql |
| **Added** | `idx_upload_rows_group_key` partial index on `(upload_id, group_key) WHERE group_key IS NOT NULL` for group key lookups | schema-bulk-upload-service.sql |
| **Added** | Section 6.4 "Group Mode: Multi-Item Events" — full subsection covering auto-detection, column convention (order-level vs item-level), end-to-end example with XLSX → groups → event JSON, inconsistency handling (`warn`/`strict`), row count impact, and retry behavior | 09-bulk-upload-service |
| **Added** | Group mode payload construction subsection in Section 6.2 — JSON structure with `sourceEventId` format `{uploadId}-group-{eventType}-{groupKeyValue}` and field source table | 09-bulk-upload-service |
| **Added** | 3 validation rules for group mode: group key column presence, empty group key value, empty item row | 09-bulk-upload-service |
| **Added** | 3 error scenarios for group mode: missing group key value (`skipped`), all item fields empty (`skipped`), inconsistent order-level data in strict mode (`failed`) | 09-bulk-upload-service |
| **Added** | 4 environment variables: `GROUP_KEY_COLUMN` (default `orderId`), `GROUP_ITEMS_PREFIX` (default `item.`), `GROUP_ITEMS_TARGET_FIELD` (default `items`), `GROUP_CONFLICT_MODE` (default `warn`) | 09-bulk-upload-service |
| **Added** | `totalEvents` field in `GET /uploads/:id/status` response JSON and field description table | 09-bulk-upload-service |
| **Added** | Group mode result file example showing grouped rows sharing the same `_notification_status` | 09-bulk-upload-service |
| **Added** | Grouped rows status info callout in Section 5.1 | 09-bulk-upload-service |
| **Added** | `item.*` Prefix and Group Key Column mapping rules in Section 6.1 | 09-bulk-upload-service |
| **Added** | `total_events` column row in uploads table (Section 9) and ER diagram | 09-bulk-upload-service |
| **Added** | `group_key` column row in upload_rows table (Section 9) and ER diagram | 09-bulk-upload-service |
| **Added** | `idx_upload_rows_group_key` index row in Section 9 indexes table and ER diagram | 09-bulk-upload-service |
| **Added** | `item.*` Prefix and Group Key Column mapping rules in Bulk Upload section | 02-detailed-microservices |
| **Added** | `total_events` column row in uploads table in Bulk Upload section | 02-detailed-microservices |
| **Added** | `group_key` column row in upload_rows table in Bulk Upload section | 02-detailed-microservices |
| **Changed** | Service overview responsibility #2 updated to mention group mode and `item.*` prefix activation | 09-bulk-upload-service |
| **Changed** | Version bumped from 1.0 to 1.1, date updated to 2026-02-21 | 09-bulk-upload-service |
| **Changed** | Validation pipeline flowchart updated with `item.*` column detection and group key column check | 09-bulk-upload-service |
| **Changed** | Processing step 3 updated to mention `group_key` computation during bulk insert | 09-bulk-upload-service |
| **Changed** | Processing step 5 rewritten to describe both standard mode (per-row) and group mode (per-group) | 09-bulk-upload-service |
| **Changed** | Processing step 7 updated to include `total_events` population | 09-bulk-upload-service |
| **Changed** | Figure 4.1 updated with grouping decision diamond between steps 3 and 4 | 09-bulk-upload-service |
| **Changed** | `progressPercent` description updated for group mode behavior | 09-bulk-upload-service |
| **Changed** | Responsibilities updated to mention group mode row consolidation | 02-detailed-microservices |
| **Changed** | Processing flow steps 5-6 updated for group mode (construct per row or per group, all rows in group share same event_id/status) | 02-detailed-microservices |
| **Changed** | CLAUDE.md database scripts paragraph updated with `total_events` in uploads description and `group_key` in upload_rows description | CLAUDE.md |

---

## Version 3.0 — 2026-02-21

**Canonical Schema "Flat" Terminology Clarification**

Clarifies the meaning of "flat" across all documentation. The canonical event schema uses a **flat top-level namespace** — all business fields are direct keys on the root object — but the values of those keys may be structured types (arrays of objects like `items`, nested objects like `additionalData`). "Flat" refers to the single-level key namespace, not to the shape of individual field values. This distinction is important for template authors who use Handlebars dot-path access, array iteration, and nested iteration against structured field values. A definition callout has been added to the canonical schema section (doc 07 §7) as the authoritative reference. All occurrences of "flat" across docs have been updated to use precise language: "flat top-level namespace" where defining the concept, and "top-level fields" where referring to field access in rule conditions, dedup keys, and recipient resolution.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | "Flat Top-Level Namespace" definition callout in Canonical Event Schema section (§7) — authoritative definition clarifying that top-level keys form a flat namespace while values may be structured types; includes examples of Handlebars dot-path access, array iteration, and nested iteration | 07-event-ingestion-service |
| **Changed** | Service overview, responsibilities, mapping descriptions, and processing pipeline steps updated from "flat canonical event format" to "canonical event format (flat top-level namespace)" with structured-value qualifiers where appropriate | 07-event-ingestion-service |
| **Changed** | `event_mappings` table description updated from "flat canonical event format" to "canonical event format (flat top-level namespace)" | 07-event-ingestion-service |
| **Changed** | Flat Event Schema callout renamed to "Flat Top-Level Namespace (v2.0)" with expanded explanation of structured field values and cross-reference to doc 07 §7 | 02-detailed-microservices |
| **Changed** | Rule engine, recipient resolution, and dedup key descriptions updated from "flat event fields" / "flat event context" to "top-level fields" / "event's top-level fields" | 02-detailed-microservices, 08-notification-engine-service |
| **Changed** | Template rendering coordination updated to clarify the full event payload (including structured field values) is passed as variable data | 08-notification-engine-service |
| **Changed** | Event flow summary updated from "flat canonical event format" to "canonical event format (flat top-level namespace)" | 01-executive-summary |
| **Changed** | Bulk upload processing descriptions updated from "flat v2.0 canonical events" to "v2.0 canonical events (flat top-level namespace)" | 09-bulk-upload-service, 02-detailed-microservices |

---

## Version 2.9 — 2026-02-21

**Template Service Deep-Dive**

Adds a comprehensive standalone deep-dive document for the Template Service. Covers the 9-step rendering pipeline with compiled Handlebars template caching, immutable versioning model (append-only, version pinning, rollback), variable auto-detection from Handlebars expressions, 8 custom helpers, multi-channel content specifications (email HTML, SMS 160-char, WhatsApp 4096-char, push 256-char limits), performance evaluation comparing PostgreSQL against DynamoDB/MongoDB/Redis (recommendation: keep PostgreSQL, add Redis only at 3+ instances), fire-and-forget audit logging via RabbitMQ (`xch.notifications.status` exchange with `template.template.*` and `template.render.*` routing keys), REST API contracts (6 endpoints + health), database design with 4 tables (`templates`, `template_versions`, `template_channels`, `template_variables`), media pass-through architecture (Template Service renders inline references, Channel Router handles binary delivery), 3 sequence diagrams (render flow, CRUD flow, multi-channel parallel rendering), error handling, security considerations (Handlebars HTML escaping, XSS prevention, content sanitization, RBAC), monitoring metrics, and configuration. Existing docs updated with cross-reference callouts, index card, and database script DDL.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | 10 — Template Service Deep-Dive document (MD) with 16 sections covering service overview, architecture & integration points, template lifecycle & structure, rendering pipeline, versioning, caching strategy, PostgreSQL vs NoSQL performance evaluation, RabbitMQ fire-and-forget audit topology, REST API endpoints, database design, media & attachments, sequence diagrams, error handling, security, monitoring, and configuration | 10-template-service |
| **Added** | `templates` table DDL with indexes (`idx_templates_slug` unique, `idx_templates_is_active`) appended to Template Service database script | schema-template-service.sql |
| **Added** | `template_versions` table DDL with unique constraint on `(template_id, version_number)` and FK to `templates` | schema-template-service.sql |
| **Added** | `template_channels` table DDL with unique constraint on `(template_version_id, channel)` and FK to `template_versions` | schema-template-service.sql |
| **Added** | `template_variables` table DDL with unique constraint on `(template_id, variable_name)` and FK to `templates` | schema-template-service.sql |
| **Added** | FK constraint `fk_templates_current_version` added from `templates.current_version_id` to `template_versions.id` (deferred creation) | schema-template-service.sql |
| **Added** | Documentation card for doc 10 added to hub page | index |
| **Added** | Cross-reference callout added after Template Service section linking to the new deep-dive document | 02-detailed-microservices |
| **Added** | Cross-reference callout added after entity relationships section linking to template_service database design | 03-system-architecture |
| **Changed** | CLAUDE.md updated with `templates`, `template_versions`, `template_channels`, and `template_variables` table descriptions in database scripts section; doc 10 added to documentation file listing | CLAUDE.md |

---

## Version 2.8 — 2026-02-21

**Media Schema Extension Across Services**

Extends the `media` array (URL-referenced images and document attachments) from the overview document (02) into the service-specific deep-dive documents. The canonical event schema in the Event Ingestion Service now formally defines the `media` field and its sub-schema. The Notification Engine dispatch payload now includes `media` pass-through to the Channel Router. The Channel Router section now documents how it processes media per channel. The Bulk Upload Service clarifies that XLSX files support a `media` JSON column.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | `media` array added to Optional Fields table in Canonical Event Schema (Section 7) with full Media Reference Schema subsection (type, url, alt, filename, mimeType, context) and URL-referenced media info callout | 07-event-ingestion-service |
| **Changed** | Full Canonical Event Example updated to include `media` array with inline image and document attachment entries | 07-event-ingestion-service |
| **Added** | `media` array added to dispatch message schema (Section 8.1) with media pass-through info callout explaining Channel Router responsibility | 08-notification-engine-service |
| **Added** | Media & Attachment Handling subsection in Channel Router Service (Section 6): per-channel processing table, URL validation, size enforcement, download timeout, graceful degradation rules | 02-detailed-microservices |
| **Added** | Media Support in XLSX Files info callout in Section 6: clarifies that XLSX files can include a `media` column with JSON array values matching the canonical media schema | 09-bulk-upload-service |

---

## Version 2.7 — 2026-02-21

**Default Values for Field Mapping Rules**

Adds an optional `default` property to the field mapping rule structure in the Event Ingestion Service. When a source path resolves to `null`, `undefined`, or is missing from the payload, the configured default value is used as a fallback before applying the transform. This enables onboarding source systems that inconsistently provide optional fields (e.g., `currency`, `language`) without requiring custom transform logic. A formal Field Mapping Rule Properties table is also added to document all rule properties (`source`, `transform`, `options`, `required`, `default`) in one place.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | `default` property (any type, optional) on field mapping rules — fallback value applied before the transform when the source path resolves to null/undefined/missing | 07-event-ingestion-service |
| **Added** | Field Mapping Rule Properties table documenting all rule properties (`source`, `transform`, `options`, `required`, `default`) with types, defaults, and behavior | 07-event-ingestion-service |
| **Changed** | Field mapping example JSON updated with a `currency` field demonstrating `default: "USD"` | 07-event-ingestion-service |
| **Changed** | Mapping resolution step 7 updated to describe default substitution before transform application; step 8 clarifies that defaults satisfy the required check | 07-event-ingestion-service |
| **Changed** | Event processing pipeline step 7 (Normalize) updated to include default value application in the mapping engine sequence | 07-event-ingestion-service |

---

## Version 2.6 — 2026-02-21

**Capacity Planning, Media & Attachments, End-to-End Tracing Enhancements, Table Purpose Descriptions**

Adds a Capacity Planning section to the System Architecture document, documenting the transactional model, throughput targets, provider rate limits, peak burst profiles, and database growth projections. Introduces URL-referenced media and attachment support across all notification channels (email, WhatsApp, SMS, push) with a `media` array on the canonical event schema. Strengthens end-to-end notification tracing by adding `correlation_id` and `provider_message_id` to `delivery_attempts`, `correlation_id` and `cycle_id` to audit tables, a unified trace API endpoint (`GET /audit/trace/:notificationId`), and provider webhook correlation documentation. Adds table purpose descriptions to the Event Ingestion Service database design section for consistency with docs 08 and 09.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | Section 13 — Capacity Planning: baseline transactional model (~5K-10K events/day), peak burst profiles (flash sales at 10x baseline), throughput targets by tier (ingestion, processing, delivery, audit), provider rate limits as the true throughput ceiling (SendGrid 100/sec, Twilio 30/sec, WhatsApp 80/sec, FCM 500/sec), and database growth projections (~34 GB/month, ~337 GB Year 1) | 03-system-architecture |
| **Added** | Media & Attachments subsection in Template Service section: `media` array schema on canonical event (type, url, alt, filename, mimeType, context), channel-specific handling table (email attachments via SendGrid, WhatsApp via Twilio MediaUrl, push via FCM image, SMS ignored), template usage examples, per-channel size limits, and media download resilience policy | 02-detailed-microservices |
| **Added** | `media` array example added to canonical event schema in Event Ingestion Service section | 02-detailed-microservices |
| **Added** | `correlation_id` and `provider_message_id` columns added to `delivery_attempts` table in Channel Router section | 02-detailed-microservices |
| **Added** | `correlation_id` and `cycle_id` columns added to `audit_events` and `delivery_receipts` tables in Audit Service section | 02-detailed-microservices |
| **Added** | `GET /audit/trace/:notificationId` unified trace API endpoint in Audit Service section — aggregates complete notification lifecycle timeline from all services | 02-detailed-microservices |
| **Added** | `GET /api/v1/notifications/:id/trace` gateway endpoint proxying to the Audit Service trace endpoint | 02-detailed-microservices |
| **Added** | Provider webhook tracing documentation: `provider_message_id` stored on send, used for webhook-to-notification correlation, orphaned receipt handling | 02-detailed-microservices |
| **Added** | Unified Trace API and Provider Webhook Correlation rows added to Monitoring & Observability table | 03-system-architecture |
| **Changed** | Correlation Tracing row in Monitoring & Observability table updated to reference `correlation_id` and `cycle_id` propagation to delivery and audit tables | 03-system-architecture |
| **Changed** | Key Relationships section updated: Notification → Delivery Attempts now references `correlation_id` and `provider_message_id`; Notification → Audit Events now references `correlation_id`, `cycle_id`, and the trace endpoint | 02-detailed-microservices |
| **Added** | Table purpose descriptions for `events`, `event_sources`, and `event_mappings` tables in Database Design section — consistent with existing descriptions in docs 08 and 09 | 07-event-ingestion-service |
| **Fixed** | Database size estimates in System Architecture Section 6 aligned with Schema Overview (doc 02 §12): `notification_gateway` ~500 MB → ~1 GB, `channel_router_service` ~30 GB → ~60 GB, `audit_service` ~100 GB → ~120 GB, `template_service` ~1 GB → ~500 MB | 03-system-architecture |
| **Fixed** | RabbitMQ delivery queue routing keys in System Architecture Section 5.1/5.2 aligned with docs 02 and 08: `deliver.{priority}.{channel}` → `notification.deliver.{priority}.{channel}` | 03-system-architecture |
| **Fixed** | Stale `MAPPING_CACHE_TTL` reference in Event Ingestion Service section replaced with current `MAPPING_CACHE_ENABLED` (event-driven invalidation, added in v1.8) | 02-detailed-microservices |

---

## Version 2.5 — 2026-02-21

**RabbitMQ Exchange Naming Convention**

All RabbitMQ exchange names across the documentation now use the `xch.` prefix to clearly distinguish exchanges from queues and routing keys. This is a naming convention change only — no functional behavior is affected.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Changed** | All RabbitMQ exchange names prefixed with `xch.`: `xch.events.incoming`, `xch.events.normalized`, `xch.notifications.deliver`, `xch.notifications.render`, `xch.notifications.status`, `xch.notifications.dlq`, `xch.config.events` | 02-detailed-microservices, 03-system-architecture, 07-event-ingestion-service, 08-notification-engine-service, 09-bulk-upload-service |
| **Changed** | ASCII art diagrams updated to reflect new exchange names with adjusted box widths | 03-system-architecture, 07-event-ingestion-service, 08-notification-engine-service, 09-bulk-upload-service |
| **Changed** | `x-dead-letter-exchange` configuration references updated to `xch.notifications.dlq` | 07-event-ingestion-service, 08-notification-engine-service |

---

## Version 2.4 — 2026-02-20

**Bulk Upload Service Deep-Dive**

Adds a comprehensive standalone deep-dive document for the Bulk Upload Service. Covers the full asynchronous file processing pipeline, three-endpoint upload lifecycle (upload, poll status, download result), result file generation with per-row `_notification_status` column mirroring the original XLSX, flexible column mapping, Event Ingestion integration via HTTP, fire-and-forget audit logging via RabbitMQ (send-and-forget pattern for all log table writes), circuit breaker for downstream resilience, database design with `uploads` and `upload_rows` table DDL plus `purge_old_uploads()` function, upload lifecycle state machine, sequence diagrams (happy path, retry, cancellation), error handling, security, monitoring metrics, and configuration. Existing docs updated with navigation links, index card, cross-reference callouts, and database script DDL.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | 09 — Bulk Upload Service Deep-Dive document (MD) with 15 sections covering service overview, architecture & integration points, file upload & validation, asynchronous processing pipeline, result file generation, XLSX file format, REST API endpoints (upload, status, result, list, detail, errors, retry, cancel, health), RabbitMQ fire-and-forget audit topology, database design, upload lifecycle state machine, sequence diagrams, error handling, security, monitoring, and configuration | 09-bulk-upload-service |
| **Added** | `uploads` table DDL with indexes (`idx_uploads_status`, `idx_uploads_uploaded_by`, `idx_uploads_created_at`, `idx_uploads_status_created`) appended to Bulk Upload Service database script | schema-bulk-upload-service.sql |
| **Added** | `upload_rows` table DDL with indexes (`idx_upload_rows_upload_id`, `idx_upload_rows_upload_status`, `idx_upload_rows_event_id` partial) and `ON DELETE CASCADE` foreign key to `uploads` | schema-bulk-upload-service.sql |
| **Added** | `purge_old_uploads()` PL/pgSQL function — deletes terminal-state uploads and cascading rows older than `p_older_than_days` (default 90); returns JSONB summary | schema-bulk-upload-service.sql |
| **Added** | Result file generation: original XLSX + `_notification_status` column with conditional formatting (green/red/yellow) per row outcome | 09-bulk-upload-service |
| **Added** | Fire-and-forget RabbitMQ audit logging via `xch.notifications.status` exchange with routing keys `bulk-upload.upload.*` — all log table writes are asynchronous | 09-bulk-upload-service |
| **Added** | Circuit breaker pattern for Event Ingestion HTTP requests (3-failure threshold, 30s cooldown) | 09-bulk-upload-service |
| **Added** | `GET /uploads/:id/status` endpoint for polling processing progress with estimated time remaining | 09-bulk-upload-service |
| **Added** | `GET /uploads/:id/result` endpoint for downloading the result XLSX file with per-row submission outcomes | 09-bulk-upload-service |
| **Added** | Documentation card for doc 09 added to hub page | index |
| **Added** | Cross-reference callout added after Bulk Upload Service section linking to the new deep-dive document | 02-detailed-microservices |
| **Added** | Cross-reference added to Bulk Upload integration pattern linking to the new deep-dive document | 03-system-architecture |
| **Changed** | CLAUDE.md updated with `uploads` table, `upload_rows` table, and `purge_old_uploads()` function reference in database scripts section | CLAUDE.md |

---

## Version 2.3 — 2026-02-20

**Customer Channel Preferences & Critical Channel Overrides**

Replaces the `recipient_preferences` table (keyed by `recipient_email`) with a `customer_id`-keyed preference system (`customer_channel_preferences`), adds configurable critical channel override rules (`critical_channel_overrides`), and introduces webhook endpoints for external preference management. Customer preferences are cached using a TTL-based read-through cache with LRU eviction; critical overrides are cached eagerly in memory with event-driven invalidation. The recipient resolution pipeline now performs 3-part channel resolution: customer preferences, critical overrides, and effective channel computation.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | `customer_channel_preferences` table — per-customer per-channel opt-in/opt-out keyed by `customer_id` with FILLFACTOR 90, autovacuum tuning, and unique constraint on `(customer_id, channel)` | schema-notification-engine-service.sql, 08-notification-engine-service |
| **Added** | `critical_channel_overrides` table — configurable forced-channel rules per event type with unique constraint on `(event_type, channel)` and partial index on active overrides | schema-notification-engine-service.sql, 08-notification-engine-service |
| **Added** | `POST /customer-preferences` webhook endpoint for single customer preference upsert (API key auth via `X-API-Key`) | 08-notification-engine-service |
| **Added** | `POST /customer-preferences/bulk` webhook endpoint for bulk preference upsert (max 1000 per request) | 08-notification-engine-service |
| **Added** | CRUD endpoints for critical channel overrides (`GET/POST/PUT/DELETE /critical-channel-overrides`) | 08-notification-engine-service |
| **Added** | TTL-based customer preference cache with LRU eviction (`PREF_CACHE_ENABLED`, `PREF_CACHE_TTL_SECONDS`, `PREF_CACHE_MAX_SIZE`) and webhook-triggered invalidation | 08-notification-engine-service |
| **Added** | Eager critical override cache with event-driven invalidation via `q.config.override-cache` queue bound to `xch.config.events` exchange | 08-notification-engine-service |
| **Added** | New monitoring metrics: `engine_pref_cache_hit_total`, `engine_pref_cache_size`, `engine_override_cache_size`, `engine_preference_lookup_duration_ms`, `engine_channels_overridden_total`, `engine_channels_filtered_total` | 08-notification-engine-service |
| **Added** | New environment variables: `PREF_CACHE_ENABLED`, `PREF_CACHE_TTL_SECONDS`, `PREF_CACHE_MAX_SIZE`, `OVERRIDE_CACHE_ENABLED`, `PREFERENCE_WEBHOOK_API_KEY` | 08-notification-engine-service |
| **Changed** | Recipient resolution pipeline updated with 3-part channel computation: customer preferences (by `customer_id`) → critical overrides (by `event_type`) → effective channels | 08-notification-engine-service |
| **Changed** | Event processing pipeline step 6 updated to include channel preference and override resolution | 08-notification-engine-service |
| **Changed** | Standard notification flow sequence diagram updated with preference lookup, override lookup, and effective channel computation steps | 08-notification-engine-service |
| **Changed** | ER diagram updated: `recipient_preferences` replaced by `customer_channel_preferences` and `critical_channel_overrides` | 08-notification-engine-service |
| **Deprecated** | `recipient_preferences` table replaced by `customer_channel_preferences` (keyed by `customer_id` instead of `recipient_email`) | 08-notification-engine-service |

---

## Version 2.2 — 2026-02-20

**Notification Engine Service Deep-Dive**

Adds a comprehensive standalone deep-dive document for the Notification Engine Service. Covers the complete 9-step event processing pipeline, declarative rule engine with 10 condition operators, recipient resolution (customer/group/custom), suppression query optimization (partial index + optional dedicated suppression_log table), template rendering coordination, notification dispatch, priority management, RabbitMQ topology, REST API contracts, full database design with 7 tables, FILLFACTOR configuration for high-update tables, autovacuum tuning, growth estimates, data retention policies, notification lifecycle state machine, sequence diagrams (happy path, suppression, multi-rule multi-channel), horizontal scalability patterns, rule caching with event-driven invalidation (RULE_CACHE_ENABLED), asynchronous status logging via RabbitMQ fire-and-forget, error handling, monitoring metrics, and configuration. Existing docs updated with navigation links, index card, and cross-reference callouts.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | 08 — Notification Engine Service Deep-Dive document (MD) with 18 sections covering service overview, architecture & integration points, event processing pipeline, rule engine, recipient resolution, suppression & deduplication, template rendering coordination, notification dispatch, priority management, RabbitMQ topology, REST API endpoints, database design, notification lifecycle state machine, sequence diagrams, performance & scalability, error handling, monitoring, and configuration | 08-notification-engine-service |
| **Added** | FILLFACTOR configuration: `notifications` (80), `notification_recipients` (85), `recipient_preferences` (90) for HOT update optimization on high-write tables | 08-notification-engine-service |
| **Added** | Autovacuum tuning settings for `notifications`, `notification_status_log`, and `notification_recipients` tables with aggressive scale factors | 08-notification-engine-service |
| **Added** | `RULE_CACHE_ENABLED` environment variable (default `false`) — eager rule cache with event-driven invalidation via `xch.config.events` exchange and `q.config.rule-cache` queue | 08-notification-engine-service |
| **Added** | Suppression query optimization: partial composite index with INCLUDE column for index-only scans, plus optional lightweight `suppression_log` table for very high-throughput deployments | 08-notification-engine-service |
| **Added** | Asynchronous status logging: notification status transitions published to `xch.notifications.status` exchange as fire-and-forget messages, persisted by a dedicated consumer | 08-notification-engine-service |
| **Added** | `purge_notification_content()` PL/pgSQL function for batched rendered content purge (default 90 days) | 08-notification-engine-service |
| **Added** | `recipient_group_members` table spec with indexes for group member resolution | 08-notification-engine-service |
| **Added** | Documentation card for doc 08 added to hub page | index |
| **Added** | Cross-reference callout added after Notification Engine Service section linking to the new deep-dive document | 02-detailed-microservices |
| **Added** | Cross-reference callout added after entity relationships diagram linking to the new deep-dive database design section | 03-system-architecture |

---

## Version 2.1 — 2026-02-20

**Required cycleId Field**

Adds `cycleId` (string) as a required field on both the webhook input payload and the canonical normalized event schema. All events — regardless of source — must now include a `cycleId` identifying the business cycle. For AMQP sources, `cycleId` is extracted via the runtime field mapping configuration. For webhook sources, it is a required top-level field in the request body. The field is carried through normalization into the canonical event and published downstream.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | `cycleId` (string, required) added to webhook request body (`POST /webhooks/events`) field descriptions and example JSON | 07-event-ingestion-service |
| **Added** | `cycleId` (string, required) added to canonical event schema v2.0 required fields table and full example JSON | 07-event-ingestion-service |
| **Added** | `cycleId` field mapping added to onboarding example in Section 3.3 | 07-event-ingestion-service |
| **Added** | `cycle_id` column (`VARCHAR(255) NOT NULL`) added to `events` table in database script | schema-event-ingestion-service.sql |
| **Added** | `cycle_id` column added to events table documentation and ER diagram | 07-event-ingestion-service |
| **Changed** | Canonical event schema JSON example in Detailed Microservices updated with `cycleId` field | 02-detailed-microservices |
| **Changed** | Events table key columns in Detailed Microservices updated to include `cycle_id` | 02-detailed-microservices |

---

## Version 2.0 — 2026-02-20

**Events Table DDL & Payload Retention**

Scaffolds the missing `event_sources` and `events` table DDL in the Event Ingestion Service database script. Adds a `purge_event_payloads()` PL/pgSQL function that NULLs out `raw_payload` and `normalized_payload` on rows older than a configurable threshold (default 90 days), reclaiming storage while preserving event metadata for audit and tracing. The function is designed to be called by `pg_cron` or an application scheduler.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | `event_sources` table DDL added to Event Ingestion Service database script — config table matching doc 07 §8 spec | schema-event-ingestion-service.sql |
| **Added** | `events` table DDL added with indexes for canonical ID lookup, deduplication, source/type filtering, status filtering, and time-range queries | schema-event-ingestion-service.sql |
| **Added** | `purge_event_payloads()` PL/pgSQL function — NULLs `raw_payload` and `normalized_payload` on rows older than `p_older_than_days` (default 90); returns JSONB summary | schema-event-ingestion-service.sql |
| **Added** | Data Retention subsection added to doc 07 §8 — explains payload purge strategy, purge function usage, and scheduling | 07-event-ingestion-service |
| **Changed** | Data Retention Policies table in doc 02 §12 updated: "Raw event payloads" row references `purge_event_payloads()` function | 02-detailed-microservices |
| **Changed** | CLAUDE.md Database Scripts section updated with `event_sources` table, `events` table, and purge function reference | CLAUDE.md |

---

## Version 1.9 — 2026-02-20

**Two-Tier Priority Queues (Normal / Critical)**

Introduces a two-tier priority system (`normal` and `critical`) for event processing and notification delivery. Priority is assigned at ingestion time based on the event mapping configuration and propagated through the entire pipeline via priority-tiered RabbitMQ queues. The Notification Engine and Channel Router consume from separate queues per priority tier, with more consumers allocated to critical queues. Notification rules may optionally override the event-level priority with a `deliveryPriority` field. This ensures that time-sensitive notifications (e.g., delivery delays, payment failures) are processed before lower-priority traffic (e.g., promotions) during backpressure.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | `priority` column (`VARCHAR(10) DEFAULT 'normal'`) on `event_mappings` table — determines event priority tier at ingestion time | 07-event-ingestion-service, 02-detailed-microservices |
| **Added** | `priority` field added to canonical event schema (v2.0) as a required top-level field | 07-event-ingestion-service, 02-detailed-microservices |
| **Added** | `delivery_priority` column on `notification_rules` table — optional per-rule override of event priority (`NULL` = inherit from event) | 02-detailed-microservices |
| **Added** | `deliveryPriority` field added to Rule Configuration Schema JSON | 02-detailed-microservices |
| **Added** | Priority-Based Processing row added to Scalability & Resilience Patterns table | 03-system-architecture |
| **Changed** | `xch.events.normalized` routing key format changed from `event.{eventType}` to `event.{priority}.{eventType}` | 07-event-ingestion-service, 03-system-architecture |
| **Changed** | `xch.notifications.deliver` routing key format changed from `deliver.{channel}` to `deliver.{priority}.{channel}` | 02-detailed-microservices, 03-system-architecture |
| **Changed** | Notification Engine consumes from two priority-tiered queues: `q.engine.events.critical` (4 consumers) and `q.engine.events.normal` (2 consumers), replacing single `q.events.normalized` queue | 02-detailed-microservices, 03-system-architecture |
| **Changed** | Channel Router consumes from priority-tiered queues per channel (e.g., `q.deliver.email.critical`, `q.deliver.email.normal`), replacing single per-channel queues | 02-detailed-microservices, 03-system-architecture |
| **Changed** | Event processing pipeline step 7 (Normalize) includes priority assignment from mapping config; step 10 (Publish) uses priority-tiered routing key | 07-event-ingestion-service |
| **Changed** | RabbitMQ topology diagram updated with priority routing keys on `xch.events.normalized` output | 07-event-ingestion-service |
| **Changed** | Notification Engine gains Priority Management responsibility | 02-detailed-microservices |
| **Changed** | Admin UI: Event Mappings page gains priority selector; Rule Management page gains delivery priority override | 02-detailed-microservices |

---

## Version 1.8 — 2026-02-20

**Eager Mapping Cache with Event-Driven Invalidation**

Adds an optional eager mapping cache to the Event Ingestion Service (`MAPPING_CACHE_ENABLED` setting, default `false`). When enabled, all active mappings are loaded into memory at startup and kept in sync via RabbitMQ invalidation events published by the Admin Service — eliminating database queries from the hot path during steady-state operation. The previous TTL-based cache (`MAPPING_CACHE_TTL`) is removed in favor of event-driven invalidation.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | Mapping Cache Strategy subsection with optional eager warm-up and event-driven invalidation via RabbitMQ (`MAPPING_CACHE_ENABLED` setting, default `false`) | 07-event-ingestion-service |
| **Added** | `xch.config.events` exchange and `q.config.mapping-cache` queue to RabbitMQ topology (provisioned when cache is enabled) | 07-event-ingestion-service |
| **Added** | `MAPPING_CACHE_ENABLED` environment variable (default `false`) | 07-event-ingestion-service |
| **Added** | `event_ingestion_mapping_cache_invalidations_total` metric | 07-event-ingestion-service |
| **Removed** | `MAPPING_CACHE_TTL` environment variable (replaced by event-driven invalidation) | 07-event-ingestion-service |
| **Changed** | Pipeline step 4 updated to reflect direct DB query by default, with cache reference when enabled | 07-event-ingestion-service |
| **Changed** | Validation info callout updated to reflect new cache invalidation behavior | 07-event-ingestion-service |

---

## Version 1.7 — 2026-02-20

**Generic Source Systems & Runtime Mapping Configuration**

Replaces hardcoded source system adapters with a generic, admin-driven runtime mapping configuration. Any source system can now be onboarded by registering it in `event_sources` and creating field mapping rules in the new `event_mappings` table — no code changes or deployments required. The canonical event schema is flattened to v2.0 with all required fields at the top level (camelCase). Per-source RabbitMQ queues are consolidated into generic queues. The `event_schemas` table is deprecated in favor of inline `validationSchema` within mapping configurations. Admin Service gains mapping CRUD endpoints and Admin UI gains a visual mapping builder page.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | `event_mappings` table DDL appended to Event Ingestion Service database script with indexes and unique constraint on `(source_id, event_type) WHERE is_active = true` | schema-event-ingestion-service.sql |
| **Changed** | Event Ingestion Service document (07) rewritten: removed 7 hardcoded source adapter subsections, added generic Source System Integration with two patterns (AMQP/Webhook), runtime mapping configuration spec, field mapping rule structure with 13 supported transforms, mapping resolution flow, and example onboarding walkthrough | 07-event-ingestion-service |
| **Changed** | Canonical event schema updated to v2.0 flat format — required fields (`eventId`, `sourceId`, `eventType`, `customerId`, `orderId`, `customerEmail`, `customerPhone`, `timestamp`) at top level instead of nested under `payload`; optional `additionalData` object; metadata gains `mappingConfigId` and `schemaVersion` "2.0" | 07-event-ingestion-service |
| **Changed** | Event processing pipeline updated: steps 3-7 reordered to Source Lookup → Mapping Lookup → Validate (optional) → Dedup → Normalize (mapping engine) | 07-event-ingestion-service |
| **Changed** | RabbitMQ topology consolidated from 6 per-source queues to 3 generic queues (`q.events.amqp`, `q.events.webhook`, `q.events.email-ingest`) | 07-event-ingestion-service |
| **Changed** | `source` field renamed to `sourceId` across webhook endpoint, canonical schema, events table, query parameters, and log entries | 07-event-ingestion-service |
| **Deprecated** | `event_schemas` table removed — validation schemas now stored inline in `event_mappings.validationSchema` | 07-event-ingestion-service |
| **Added** | Event Mapping CRUD endpoints (`GET/POST/PUT/DELETE /api/v1/event-mappings`, `POST /api/v1/event-mappings/:id/test`) added to Admin Service | 07-event-ingestion-service, 02-detailed-microservices |
| **Changed** | Detailed Microservices document (02) updated: Event Ingestion section uses generic language, new v2.0 canonical schema, `event_mappings` table added; Admin Service gains mapping CRUD endpoints; Admin UI gains Event Mappings page; Notification Engine rules reference flat field paths; Schema Overview and Inter-Service Communication updated | 02-detailed-microservices |
| **Changed** | System Architecture document (03) updated: generic source boxes in diagrams, updated event flow, generic RabbitMQ queues, `event_mappings` in database tables, updated integration patterns | 03-system-architecture |
| **Changed** | Executive Summary document (01) updated: solution, objectives, and event flow made generic while preserving problem statement source list as historical context | 01-executive-summary |
| **Added** | `MAPPING_CACHE_TTL` environment variable replaces `SCHEMA_CACHE_TTL` | 07-event-ingestion-service |
| **Changed** | CLAUDE.md updated with `event_mappings` table reference in database scripts section | CLAUDE.md |

---

## Version 1.6 — 2026-02-20

**Schema Naming Standardization**

Standardizes PostgreSQL schema naming across all SQL scripts and documentation. All schemas now use snake_case derived directly from folder names (e.g., `event_ingestion_service` not `event_ingestion`). Documentation updated to use "Schema" terminology instead of "Database" where referring to PostgreSQL schemas. Added `notification_gateway` schema to documentation tables.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Fixed** | Added missing `_service` suffix to 5 SQL schema scripts: `event_ingestion` -> `event_ingestion_service`, `notification_engine` -> `notification_engine_service`, `channel_router` -> `channel_router_service`, `email_ingest` -> `email_ingest_service`, `bulk_upload` -> `bulk_upload_service`. Schema, role, and user names all updated consistently. | 5 dbscripts/*.sql |
| **Changed** | Replaced all `*_db` schema references with correct snake_case names derived from folder names across all documentation tables, SVG diagrams, ASCII diagrams, info boxes, and prose text | 02, 03, 04, 07 |
| **Changed** | Updated "Database" labels and column headers to "Schema" in service overview tables, per-service info boxes, and schema summary sections where they refer to PostgreSQL schemas | 02, 03, 07 |
| **Added** | Added `notification_gateway` schema to documentation overview tables, architecture diagrams, and schema summary sections | 02, 03 |
| **Changed** | Updated CLAUDE.md to clarify schema-per-service pattern and added complete schema/role/user mapping table | CLAUDE.md |

---

## Version 1.5 — 2026-02-20

**Event Ingestion Service Deep-Dive**

Adds a comprehensive standalone deep-dive document for the Event Ingestion Service. Covers all seven source system adapters with field mappings, the 10-step event processing pipeline, RabbitMQ topology, REST API contracts, database ERD, schema validation flow, idempotency and deduplication logic, webhook and consumer sequence diagrams, error handling, monitoring, and configuration. Includes 7 inline SVG diagrams. Existing docs updated with navigation links, index card, and cross-reference callout.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | 07 — Event Ingestion Service Deep-Dive document (HTML + MD) with 14 sections covering service overview, architecture, source adapters, processing pipeline, RabbitMQ topology, REST API, canonical schema, database design, validation, idempotency, sequence diagrams, error handling, monitoring, and configuration | 07-event-ingestion-service |
| **Added** | 7 inline SVG diagrams: Integration Context, Event Processing Pipeline flowchart, RabbitMQ Topology, Database ERD, Idempotency Check flowchart, Webhook Sequence Diagram, RabbitMQ Consumer Sequence Diagram | 07-event-ingestion-service |
| **Added** | Full REST API endpoint documentation for `POST /webhooks/events`, `GET /health`, `GET /events/:eventId`, and `GET /events` with request/response schemas | 07-event-ingestion-service |
| **Added** | Per-source adapter specifications for OMS, Magento 2, Mirakl, Chat Commerce, Email Ingest, Bulk Upload, and Manual Trigger — including raw payloads, field mapping tables, and authentication details | 07-event-ingestion-service |
| **Added** | Documentation card for doc 07 added to hub page | index |
| **Added** | Cross-reference callout added after Event Ingestion Service idempotency section linking to the new deep-dive document | 02-detailed-microservices |
| **Changed** | Navigation bars updated across all docs (01–06) to include "Event Ingestion" link | 01, 02, 03, 04, 05, 06 |

---

## Version 1.4 — 2026-02-20

**Port Reassignment (3150+)**

Reassigns all microservice REST/HTTP ports from the 3000-3010 range to a sequential 3150-3159 range to avoid conflicts with commonly-used development ports. The SMTP port 2525 for the Email Ingest Service remains unchanged. All documentation, SVG diagrams, ASCII diagrams, deployment tables, and code examples have been updated to reflect the new port assignments.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Changed** | All microservice REST/HTTP ports reassigned: notification-gateway 3000->3150, event-ingestion 3001->3151, notification-engine 3002->3152, template-service 3003->3153, channel-router 3004->3154, admin-service 3005->3155, audit-service 3006->3156, email-ingest REST 3007->3157, bulk-upload 3008->3158, admin-ui 3010->3159 | CLAUDE.md, 01, 02, 03, 05 |
| **Changed** | SVG diagrams updated with new port labels (High-Level Architecture, Layer Architecture, Executive Summary flow) | 01-executive-summary, 03-system-architecture |
| **Changed** | ASCII art diagrams updated with new port labels | 03-system-architecture (MD) |
| **Changed** | Deployment Architecture tables updated with new ports | 03-system-architecture |
| **Changed** | Playwright config `baseURL` updated from `localhost:3010` to `localhost:3159` | 05-testing-strategy |
| **Changed** | Historical changelog entries updated to reflect new port numbers | 06-changelog |

---

## Version 1.3 — 2026-02-19

**Notification Suppression & Deduplication**

Adds configurable per-rule suppression and deduplication policies to the Notification Engine. Rules can now define dedup key paths, deduplication windows, max send counts, and cooldown periods to prevent duplicate or excessive notifications. A new SUPPRESSED terminal state is added to the notification lifecycle. All configuration is manageable by the operative team via the Admin UI without code changes.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | `suppression` JSONB column on `notification_rules` table | 02-detailed-microservices |
| **Added** | `dedup_key_hash` and `dedup_key_values` columns on `notifications` table | 02-detailed-microservices |
| **Added** | Suppression & Deduplication subsection with full spec and examples | 02-detailed-microservices |
| **Added** | Suppression check step in rule evaluation pipeline | 02-detailed-microservices |
| **Added** | SUPPRESSED notification status in lifecycle state machine | 03-system-architecture |
| **Changed** | Rule Configuration Schema updated with `suppression` field | 02-detailed-microservices |
| **Changed** | Admin Service rule CRUD endpoints accept `suppression` config | 02-detailed-microservices |
| **Changed** | Notification lifecycle flowchart includes SUPPRESSED branch | 03-system-architecture |

---

## Version 1.2 — 2026-02-19

**Bulk Upload Service**

Adds the Bulk Upload Service — a new microservice that enables the operative team to trigger bulk notifications by uploading XLSX spreadsheet files via the Admin UI. Each row is parsed and submitted to the Event Ingestion Service as a standard event. Existing docs updated with the new service section, gateway endpoints, database schema, deployment entries, architecture diagrams, and Admin UI page.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | Bulk Upload Service section (purpose, XLSX format spec, API endpoints, DB schema, processing flow, error handling, security) | 02-detailed-microservices |
| **Added** | Bulk Upload Service row in Microservices Overview table (port 3158, `bulk_upload_db`) | 02-detailed-microservices |
| **Added** | Gateway proxy endpoints for bulk upload operations | 02-detailed-microservices |
| **Added** | Bulk Upload page (`/bulk-upload`) added to Admin UI Key Pages | 02-detailed-microservices |
| **Added** | `bulk_upload_db` added to Database Schema Overview | 02-detailed-microservices |
| **Added** | Inter-service communication rows for Gateway → Bulk Upload and Bulk Upload → Event Ingestion | 02-detailed-microservices |
| **Added** | `bulk-upload-service` row added to executive summary Microservices Overview table | 01-executive-summary |
| **Added** | Bulk Upload Service added to High-Level Architecture diagram | 03-system-architecture |
| **Added** | Bulk Upload :3158 added to Layer Architecture diagram (Compute layer) | 03-system-architecture |
| **Added** | `bulk_upload_db` added to Database Architecture table and Data layer diagram | 03-system-architecture |
| **Added** | Bulk Upload container added to Deployment Architecture table | 03-system-architecture |
| **Added** | Bulk Upload integration pattern added to Integration Patterns table | 03-system-architecture |
| **Changed** | Service count updated from 9 to 10 (eight backend + one frontend → nine backend + one frontend) | 01, 02, 03 |
| **Changed** | Database count updated from 7 to 8 PostgreSQL databases | 02, 03 |
| **Fixed** | Fixed SVG diagram overlap in High-Level Architecture (Figure 2.1) — Bulk Upload Service no longer overlaps with Gateway and Admin UI boxes; bottom admin row and legend shifted down +90px, viewBox height increased from 540 to 630 | 03-system-architecture |

---

## Version 1.1 — 2026-02-19

**Authentication, Identity & Testing Strategy**

Introduces the authentication and identity layer for the platform — local credentials, SAML 2.0 SSO with Azure AD, JWT session management, and account linking — along with a comprehensive testing strategy covering Jest unit tests, Playwright E2E, and Allure reporting. Existing docs were updated with new auth endpoints, SAML database tables, security model changes, and testing framework references.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | 04 — Authentication & Identity document (HTML + MD) | 04-authentication-identity |
| **Added** | 05 — Testing Strategy document (HTML + MD) | 05-testing-strategy |
| **Added** | Auth endpoints added to Gateway section | 02-detailed-microservices |
| **Added** | SAML database tables added to Admin Service | 02-detailed-microservices |
| **Added** | SAML SSO row added to auth layers | 03-system-architecture |
| **Added** | Jest, Playwright, Allure added to tech stack | 01-executive-summary |
| **Added** | Login and IdP Settings pages added to Admin UI | 02-detailed-microservices |
| **Changed** | Navigation bars updated across all docs to include new pages | 01, 02, 03, 04, 05 |
| **Changed** | Index hub updated with doc cards for 04 and 05 | index |
| **Changed** | Security section updated for dual auth model | 02-detailed-microservices |
| **Changed** | Timeline updated to reference testing frameworks | 01-executive-summary |

---

## Version 1.0 — 2026-02-19

**Initial Documentation Release**

First release of the Notification API design documentation. Establishes the foundational architecture docs covering the project overview, all nine microservice specifications with API contracts and database schemas, and the full system architecture including event flows, RabbitMQ topology, and deployment patterns. Includes the documentation hub and shared stylesheet.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | 01 — Executive Summary (HTML + MD) | 01-executive-summary |
| **Added** | 02 — Detailed Microservices (HTML + MD) | 02-detailed-microservices |
| **Added** | 03 — System Architecture (HTML + MD) | 03-system-architecture |
| **Added** | Documentation hub (index.html + index.md) | index |
| **Added** | Shared CSS stylesheet (css/styles.css) | css/styles.css |

---

*Notification API Documentation v3.2 -- Architecture Team -- 2026*
