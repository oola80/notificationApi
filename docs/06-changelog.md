# 06 — Changelog

**Notification API — Documentation & Feature Change Log**

| | |
|---|---|
| **Version:** | 2.6 |
| **Date:** | 2026-02-28 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

- [About This Changelog](#about-this-changelog)
- [Version 4.1](#version-41--2026-02-28) — Notification Admin UI Implementation Complete
- [Version 4.0](#version-40--2026-02-28) — Notification Admin UI v2.0 (Architectural Simplification)
- [Version 3.9](#version-39--2026-02-27) — Auth/RBAC Decoupling & Architecture Restructuring
- [Version 3.8](#version-38--2026-02-26) — Provider Adapter Services & Adapter Replacement
- [Version 3.7](#version-37--2026-02-21) — Audit Service Deep-Dive
- [Version 3.6](#version-36--2026-02-21) — Notification Admin UI Deep-Dive
- [Version 3.5](#version-35--2026-02-21) — Admin Service Deep-Dive
- [Version 3.4](#version-34--2026-02-21) — Notification Gateway Deep-Dive
- [Version 3.3](#version-33--2026-02-21) — RabbitMQ Topology Reference
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

## Version 4.1 — 2026-02-28

**Notification Admin UI — Implementation Complete (All Phases)**

All planned phases (1–13) of the Notification Admin UI are now implemented. The final phase adds Audit Trail with tabbed view (Audit Logs + DLQ management), CSV export, expandable rows with JSON metadata viewer, dead letter queue status management with state machine transitions and reprocess capability. Polish includes: error boundaries for all route groups, loading skeletons for all routes, per-page metadata titles, removal of test-components page, and DLQ status variants in StatusBadge. Authentication remains deferred per v2.0 design.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Changed** | Notification Admin UI endpoint reference — `/audit` route status updated from "In Progress" to "Done" | endpoints-notification-admin-ui |
| **Changed** | notification-admin-ui CLAUDE.md — updated Implementation Status to show Phase 13 complete, `/audit` route status updated to Done | notification-admin-ui/CLAUDE.md |

---

## Version 4.0 — 2026-02-28

**Notification Admin UI v2.0 — Architectural Simplification**

Rewrites the Notification Admin UI design document (15) to v2.0. Defers authentication entirely (no login, no JWT, no RBAC) since auth-rbac-service is not yet implemented. Replaces the single-gateway BFF communication pattern with direct microservice communication — the UI connects to 7 backend services individually (event-ingestion-service, notification-engine-service, template-service, channel-router-service, admin-service, audit-service, bulk-upload-service) via per-service environment variables. Removes auth-related pages (login, forgot-password, reset-password), user management pages (moved to auth-rbac-service-frontend), and SAML IdP settings. Simplifies the component hierarchy by removing SessionProvider, AuthGuard, and RBACProvider wrappers. Updates the API integration layer to a multi-service client with service-key routing. All notification management functionality (dashboard, rules, templates, channels, mappings, logs, bulk upload, recipient groups, system settings) remains unchanged.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Changed** | 15 — Notification Admin UI rewritten to v2.0 (20 sections) — updated service overview (no auth, 7 direct microservice dependencies), new architecture diagram with multi-service integration, authentication deferred (§5) with future integration path referencing doc 18, direct microservice communication with service routing map, multi-service API client with per-service base URLs, removed auth/user/SAML pages and components, simplified component hierarchy (no auth wrappers), updated routing (23 routes, all public), updated sequence diagrams (dashboard, template preview, rule save — no gateway), updated environment variables (7 per-service URLs), updated Docker Compose, updated security/testing/monitoring sections | 15-notification-admin-ui |
| **Changed** | notification-admin-ui CLAUDE.md — updated to reflect direct microservice communication (7 services), no authentication, multi-service API client, updated dependencies list, updated folder structure (no auth components) | notification-admin-ui/CLAUDE.md |
| **Changed** | notification-admin-ui convenience copy (docs/15-notification-admin-ui.md) — updated with v2.0 summary, service routing map, table of contents | notification-admin-ui/docs/ |
| **Changed** | Notification Admin UI endpoint reference — removed 7 auth/user/SAML routes (login, forgot-password, reset-password, users, users/:id, identity-providers, identity-providers/:id), added v2 note header, added Removed Routes section with reasons | endpoints-notification-admin-ui |

---

## Version 3.9 — 2026-02-27

**Auth/RBAC Decoupling & Architecture Restructuring**

Decouples authentication, user management, and RBAC from admin-service and notification-gateway into a standalone multi-application auth service (auth-rbac-service-backend :3160). Introduces two-token JWT model (RS256 platform + app-scoped tokens) with refresh token rotation and replay detection. Adds auth admin frontend (auth-rbac-service-frontend :3161) and centralized login portal with application launcher (ecommerce-backoffice :3162). Deprecates notification-gateway (:3150) — responsibilities redistributed to auth service, per-service JWT validation, and infrastructure reverse proxy. Simplifies admin-service by removing user/SAML management and adding JWT validation guard. Updates notification-admin-ui to connect directly to admin-service instead of gateway.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | 18 — Auth/RBAC Architecture Addendum document (MD) — purpose, motivation, architectural changes summary table (before/after), new services table, gateway removal with responsibility redistribution, admin-service modifications, auth token flow with ASCII sequence diagrams (login, app launch, token validation), JWT architecture (platform + application tokens, refresh token rotation, JWKS endpoint), RS256 key distribution, impact on all existing services, updated port table, new error code prefixes (ARS-, ECB-), webhook routing migration to infrastructure proxy | 18-auth-rbac-architecture-addendum |
| **Added** | 19 — Auth RBAC Service Backend Deep-Dive document (MD) with 17 sections — service overview, architecture with integration diagram, authentication flow (login, refresh with replay detection, logout, forgot/reset/change password), password policy (12+ chars, bcrypt cost 12, history of 5, 90-day max age, lockout), application management, user lifecycle (ACTIVE/LOCKED/DEACTIVATED), role management with hierarchy and system roles, permission management (resource + action pairs), user-application access model, JWT architecture (RS256, JWKS), REST API (35+ endpoints), database design (9 tables with ER diagram), 4 sequence diagrams, 24 error codes, security considerations, monitoring/health, configuration | 19-auth-rbac-service-backend |
| **Added** | 20 — Auth RBAC Service Frontend Deep-Dive document (MD) — Next.js 14 admin UI for auth management, self-authenticating via app-scoped JWT, 7 page specifications with ASCII wireframes (application list/create/detail, user list/create/detail), component architecture, routing table, API integration mapping | 20-auth-rbac-service-frontend |
| **Added** | 21 — eCommerce Backoffice Deep-Dive document (MD) — Next.js 14 login portal and application launcher, authentication flow with ASCII sequence diagram, session management (proactive refresh, expiry detection), 4 page specifications with ASCII wireframes (login, forgot password, reset password, app launcher grid), component architecture, routing table, security considerations | 21-ecommerce-backoffice |
| **Added** | auth-rbac-service-backend/ folder scaffold — CLAUDE.md (port 3160, NestJS, 9 DB tables, no RabbitMQ, ARS- prefix, planned folder structure), dbscripts/ (schema SQL + objects SQL with 9 tables, indexes, purge function), docs/ (convenience copy + changelog) | auth-rbac-service-backend/ |
| **Added** | auth-rbac-service-frontend/ folder scaffold — CLAUDE.md (port 3161, Next.js 14, SWR, planned folder structure), docs/ (convenience copy + changelog) | auth-rbac-service-frontend/ |
| **Added** | ecommerce-backoffice/ folder scaffold — CLAUDE.md (port 3162, Next.js 14, planned folder structure), docs/ (convenience copy + changelog) | ecommerce-backoffice/ |
| **Added** | Endpoint reference files for 3 new services — endpoints-auth-rbac-service-backend.md (35+ endpoints), endpoints-auth-rbac-service-frontend.md (7 routes), endpoints-ecommerce-backoffice.md (4 routes) | endpoints/ |
| **Changed** | Root CLAUDE.md — added 3 new services to Microservices table, marked notification-gateway as Deprecated, added auth-rbac-service-backend to Database Scripts table, added 3 service folder entries, added 3 endpoint files, added 4 doc entries (18-21), added error prefixes (ARS-, ECB-), updated Project Status | CLAUDE.md |
| **Changed** | admin-service CLAUDE.md — removed "Proxied through: notification-gateway" from Related Services, removed user management and SAML from description, updated Database Tables (only system_configs), added auth-rbac-service-backend dependency for JWT validation, updated planned folder structure (removed users/, saml/, added auth/) | admin-service/CLAUDE.md |
| **Changed** | notification-admin-ui CLAUDE.md — changed API Backend from notification-gateway (:3150) to admin-service (:3155), updated Dependencies and Related Services | notification-admin-ui/CLAUDE.md |
| **Deprecated** | All notification-gateway endpoints marked as "Deprecated — service removed" | endpoints-notification-gateway |
| **Deprecated** | Admin Service user management endpoints (POST/GET/PUT /admin/users, POST /admin/users/:id/reset-password) and SAML IdP endpoints marked as "Deprecated — moved to auth-rbac-service-backend" | endpoints-admin-service |

---

## Version 3.8 — 2026-02-26

**Provider Adapter Services & Adapter Replacement**

Replaces the original 5-adapter set (SendGrid, Mailgun, Braze, Twilio, FCM) with a new 4-adapter set in a single NestJS monorepo: Mailgun (:3171), Braze (:3172), WhatsApp/Meta Cloud API (:3173), AWS SES (:3174). SendGrid, Twilio, and Firebase Cloud Messaging are permanently removed. Port 3170 is left unassigned for future use. Adds the authoritative Provider Adapter Services design document (17-provider-adapters.md) with 19 sections covering the monorepo architecture, standardized HTTP contract (4 endpoints × 4 adapters), per-adapter deep-dives (Mailgun v3 REST API, Braze multi-channel /messages/send, WhatsApp Meta Cloud API v21.0, AWS SES v2 API/SMTP), webhook architecture with unified status mapping, error classification, media handling, registration in core services, WhatsApp routing rule (mutual exclusion via isActive flag), and testing/monitoring strategy. Adds 4 per-adapter reference documents, service CLAUDE.md, endpoint reference, and convenience copy. Updates all v2 design documents to replace stale adapter references: Channel Router Service v2 (heaviest update — dependencies, architecture diagram, upstream/downstream table, per-adapter sections, provider summary, rate limits, webhook routing, status mapping, sequence diagrams, security credentials), RabbitMQ Topology v2 (exchange publishers, port ranges, routing key examples, system-wide flow diagram), Notification Gateway v2 (downstream table, architecture diagram, webhook routing table, endpoint sections, readiness response, env vars), Audit Service v2 (provider examples, event status mapping, trace examples, sequence diagrams, provider column values). Updates service CLAUDE.md files (channel-router-service, notification-gateway) and root CLAUDE.md with new adapter set.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | 17 — Provider Adapter Services Deep-Dive document (MD) with 19 sections covering service overview, architecture, NestJS monorepo structure, adapter service table (4 adapters), standardized HTTP contract (SendRequest/SendResult/Health/Capabilities interfaces), shared infrastructure (libs/common), Mailgun adapter, Braze adapter, WhatsApp adapter, AWS SES adapter, webhook architecture, error classification, media handling, configuration, registration in core services, WhatsApp routing rule, adding a new provider, testing strategy, monitoring | 17-provider-adapters |
| **Added** | Per-adapter reference docs: adapter-mailgun.md (Mailgun v3 REST, HMAC-SHA256 webhooks), adapter-braze.md (multi-channel, profile sync, Currents), adapter-whatsapp.md (Meta Cloud API v21.0, template messages, 24h window), adapter-aws-ses.md (dual mode API/SMTP, SNS webhooks, X.509 verification) | provider-adapters/docs/ |
| **Added** | Provider adapters endpoint reference (5 endpoints × 4 adapters with adapter-specific notes) | endpoints-provider-adapters |
| **Added** | Provider adapters CLAUDE.md with monorepo context, adapter table, target folder structure, coding conventions | provider-adapters/CLAUDE.md |
| **Added** | Convenience copy of 17-provider-adapters.md in provider-adapters/docs/ | provider-adapters/docs/ |
| **Added** | Provider webhook endpoints section in notification-gateway endpoint reference (4 webhook proxy routes) | endpoints-notification-gateway |
| **Changed** | Channel Router Service v2: Replaced 5-adapter set with 4-adapter set throughout — dependencies, architecture diagram, upstream/downstream table, provider adapter reference table, per-adapter sections (removed SendGrid/Twilio/FCM, added WhatsApp/AWS SES), provider summary, rate limits, webhook routing, event status mapping, provider message ID correlation, webhook signature verification, Braze latency note, RabbitMQ routing key examples, readiness response, sequence diagrams, security credentials | 11-channel-router-service-v2 |
| **Changed** | RabbitMQ Topology v2: Updated xch.notifications.status publishers, port ranges (:3171-:3174), adapter names in flow diagram and routing key examples | 12-rabbitmq-topology-v2 |
| **Changed** | Notification Gateway v2: Updated provider webhooks inbound row, downstream adapter rows, architecture diagram, webhook routing table, webhook endpoint sections, readiness response, env vars (ADAPTER_*_URL) | 13-notification-gateway-v2 |
| **Changed** | Audit Service v2: Replaced all sendgrid/twilio/fcm references with mailgun/whatsapp-meta/aws-ses in examples, event status mapping, trace responses, sequence diagrams, provider column values | 16-audit-service-v2 |
| **Changed** | Root CLAUDE.md: Updated tech stack (notification providers), service table (channel-router-service description), service folders (added provider-adapters/ entry), endpoint reference (added endpoints-provider-adapters.md), documentation listing (added 17-provider-adapters.md) | CLAUDE.md |
| **Changed** | channel-router-service CLAUDE.md: Updated dependencies and related services to new adapter set | channel-router-service/CLAUDE.md |
| **Changed** | notification-gateway CLAUDE.md: Added webhook proxy targets to related services | notification-gateway/CLAUDE.md |
| **Changed** | Synced convenience copies: channel-router-service/docs/11-channel-router-service-v2.md, notification-gateway/docs/13-notification-gateway-v2.md, audit-service/docs/16-audit-service-v2.md | Convenience copies |
| **Removed** | SendGrid adapter references (adapter-sendgrid :3170) from all v2 design docs | All v2 docs |
| **Removed** | Twilio adapter references (adapter-twilio :3173) from all v2 design docs — replaced by adapter-whatsapp | All v2 docs |
| **Removed** | Firebase Cloud Messaging / FCM adapter references (adapter-fcm :3174) from all v2 design docs — replaced by adapter-aws-ses | All v2 docs |

---

## Version 3.7 — 2026-02-21

**Audit Service Deep-Dive**

Adds a comprehensive standalone deep-dive document for the Audit Service. Covers the event sourcing model with append-only immutable audit trail and event type taxonomy (~20 types grouped by lifecycle stage), multi-source event capture pipeline with 5 independent consumer groups (one per RabbitMQ queue) and batch insert optimization (configurable batch size and flush interval), delivery receipt correlation via `provider_message_id` with provider status normalization and orphaned webhook handling, end-to-end notification trace reconstruction (5-step algorithm merging `audit_events` and `delivery_receipts` into chronological timelines), cross-notification tracing via `correlation_id` and `cycle_id`, analytics aggregation engine with hourly/daily rollup jobs using idempotent upsert strategy, full-text search using PostgreSQL `tsvector`/`tsquery` with weighted GIN index, dead-letter queue monitoring with status tracking (pending/investigated/reprocessed/discarded) and manual reprocessing endpoint, RabbitMQ topology (5 consumed queues across 4 exchanges, 9 consumers, no outbound publishing), 12 REST API endpoints across 6 categories (trace, logs, receipts, analytics, DLQ, health), database design with 4 tables (`audit_events` with full-text search vector, `delivery_receipts` with provider correlation, `notification_analytics` with upsert key, `dlq_entries` with status tracking) and 14 indexes, two-tier data retention and purge strategy (90-day payload NULLing / 2-year metadata retention) with `purge_audit_payloads()` PL/pgSQL function and partitioning recommendation, 4 sequence diagrams (full lifecycle audit accumulation, delivery receipt correlation, analytics aggregation job, DLQ capture and reprocessing), error handling with consumer resilience (6 error types, poison message handling, idempotency), GDPR compliance (Right to Erasure anonymization, Right of Access export, CAN-SPAM, consent tracking, data access logging), security considerations (data classification, RBAC per endpoint, PII masking, encryption), 14 monitoring metrics with alerting thresholds, and 20 environment variables. Existing docs updated with cross-reference callouts, index card, and CLAUDE.md listing.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | 16 — Audit Service Deep-Dive document (MD) with 19 sections covering service overview, architecture & integration points, event sourcing model, multi-source event capture pipeline, delivery receipt correlation, end-to-end notification trace, analytics aggregation engine, full-text search, dead-letter queue monitoring, RabbitMQ topology, REST API endpoints (12 endpoints across 6 categories), database design (4 tables, 14 indexes), data retention & purge strategy, sequence diagrams (4), error handling & consumer resilience, GDPR & compliance, security considerations, monitoring & health checks, and configuration | 16-audit-service |
| **Added** | Event sourcing model with immutability contract, AuditEvent schema, event type taxonomy (~20 types across 7 lifecycle stages), correlation model (notification_id, correlation_id, cycle_id), and notification lifecycle state diagram | 16-audit-service |
| **Added** | Multi-source event capture pipeline with 5 consumer groups (Events, Deliver, Status, Template, DLQ), batch insert optimization (configurable batch size and flush interval), and fire-and-forget resilience design | 16-audit-service |
| **Added** | Delivery receipt correlation strategy with provider_message_id, provider status normalization mapping (20 provider-specific statuses across SendGrid, Mailgun, Twilio, FCM, Braze), and orphaned webhook handling | 16-audit-service |
| **Added** | End-to-end notification trace with 5-step reconstruction algorithm, `GET /audit/trace/:notificationId` full spec, timeline stage table (19 stages), cross-notification tracing via correlation_id/cycle_id, and trace merge diagram | 16-audit-service |
| **Added** | Analytics aggregation engine with hourly/daily scheduling, 8 metrics, idempotent upsert, and 5 dashboard query patterns | 16-audit-service |
| **Added** | Full-text search using PostgreSQL tsvector/tsquery with weighted GIN index (4 weight tiers) and compound search API | 16-audit-service |
| **Added** | Dead-letter queue monitoring with DLQ entry structure, 4 status states (pending, investigated, reprocessed, discarded), and manual reprocessing endpoint | 16-audit-service |
| **Added** | Database design with 4 tables (audit_events, delivery_receipts, notification_analytics, dlq_entries), 14 indexes, growth estimates (~13.5 GB/year), and ASCII ERD | 16-audit-service |
| **Added** | Two-tier data retention strategy (90-day payload / 2-year metadata), `purge_audit_payloads()` PL/pgSQL function, DLQ entry retention policy, and partitioning recommendation | 16-audit-service |
| **Added** | 4 sequence diagrams: full lifecycle audit accumulation, delivery receipt correlation from provider webhook, analytics aggregation job with idempotent upsert, DLQ capture investigation and reprocessing | 16-audit-service |
| **Added** | GDPR compliance: Right to Erasure anonymization endpoint, Right of Access JSON export, CAN-SPAM unsubscribe tracking, consent change logging, data access audit logging | 16-audit-service |
| **Added** | 14 monitoring metrics with alerting thresholds and 20 environment variables | 16-audit-service |
| **Added** | Cross-reference callout added after Audit Service section linking to the new deep-dive document | 02-detailed-microservices |
| **Added** | Compute Layer description updated with cross-reference to audit service deep-dive document | 03-system-architecture |
| **Added** | Documentation card for doc 16 added to hub page | index |
| **Changed** | Index hub page version bumped to 2.3, date updated to 2026-02-21, doc 16 card added | index |
| **Changed** | CLAUDE.md updated with doc 16 in documentation file listing and audit-service database tables description updated with dlq_entries table | CLAUDE.md |

---

## Version 3.6 — 2026-02-21

**Notification Admin UI Deep-Dive**

Adds a comprehensive standalone deep-dive document for the Notification Admin UI (Next.js Frontend). Covers the Next.js 14 App Router architecture with TypeScript, technology stack (TipTap WYSIWYG editor, SWR data fetching with caching and revalidation, Tailwind CSS, Radix UI accessible primitives, React Hook Form with Zod validation, Recharts for dashboard visualizations, Monaco Editor for JSON payloads), application folder structure with feature-based organization, authentication and session management (in-memory access token storage for XSS prevention, proactive token refresh at 13-minute mark, HTTP-only refresh cookie, 401 interceptor with automatic retry), login page with local credentials and conditional SSO button, RBAC enforcement in the UI (permission check utility with `useRBAC` hook, UI visibility matrix for 4 roles across 20+ UI elements, client-side enforcement as UX optimization with Gateway as security boundary), SWR data fetching strategy (revalidate on focus, deduplication, error retry, configurable polling per resource, SSR prefetch with SWR fallback for zero-loading-state first paint), 12 detailed page specifications with ASCII wireframes (dashboard with metric cards, volume chart, channel breakdown, delivery rates, channel health, top rules, recent failures, and graceful degradation; rule management with condition builder, template picker, channel selector, suppression config, and cross-service validation feedback; template editor with TipTap WYSIWYG for email, plain text for SMS/WhatsApp, structured form for push, live preview with debounced rendering, variable detection, and version history; channel configuration with health cards and provider-specific forms; notification logs with lifecycle timeline, rendered content preview, and delivery attempts; event mapping editor with visual field mapping builder and mapping test panel with Monaco editor; bulk upload with drag-and-drop, real-time progress polling, error detail panel; user management; recipient groups with static/dynamic types; audit log viewer; system configuration; SAML IdP settings), component architecture hierarchy (SessionProvider → AuthGuard → RBACProvider → SidebarLayout → PageContent), shared component library (DataTable, StatusBadge, ConfirmDialog, EmptyState, Pagination, SearchInput, DateRangePicker), API integration layer with fetch wrapper (base URL, auth headers, response parsing, token refresh interceptor), 60+ Gateway endpoint mappings across 12 feature areas, routing table with 30+ routes and role-based access requirements, sidebar navigation with role-conditional sections, 4 flowcharts (rule creation end-to-end, template save with versioning, bulk upload processing with polling, mapping test), 5 sequence diagrams (local login, SSO login with SAML redirect, dashboard SSR prefetch with SWR fallback, template live preview with debounced rendering, token refresh with 401 recovery), UI data model entity relationships (NotificationRule, Template, TemplateVersion, Notification, Channel, EventMapping, BulkUpload, RecipientGroup, DashboardStats), error handling with two-tier validation (client-side Zod + server-side API errors mapped to form fields), toast notification system (success/error/warning/info), accessibility standards (WCAG 2.1 AA, keyboard navigation, screen reader support, color contrast, focus indicators, reduced motion), responsive breakpoints (desktop/tablet/mobile with desktop as primary target), testing strategy (Jest unit tests for hooks and utilities, React Testing Library for components, Playwright E2E for 7 critical flows), security considerations (XSS prevention, CSRF protection, CSP headers, token storage strategy, clickjacking prevention, dependency auditing), client-side monitoring (page load time, API latency, error rate, auth refresh tracking), deployment (multi-stage Docker build with standalone output, Docker Compose entry, build pipeline with lint/typecheck/test/build/deploy stages, performance optimization including code splitting, lazy loading, and SWR caching), and 14 environment variables. Existing docs updated with cross-reference callouts, index card, and CLAUDE.md listing.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | 15 — Notification Admin UI Deep-Dive document (MD) with 21 sections covering service overview, architecture & integration points, technology stack & libraries, application structure, authentication & session management, RBAC in the UI, data fetching & state management, page specifications (12 pages with ASCII wireframes), component architecture, API integration layer (60+ endpoint mappings), routing & navigation, flowcharts (4), sequence diagrams (5), entity relationship UI data model, error handling & user feedback, accessibility & responsive design, testing strategy, security considerations, monitoring & observability, configuration (14 environment variables), and deployment | 15-notification-admin-ui |
| **Added** | Dashboard page specification with ASCII wireframe layout, 7 data source widgets with polling intervals, and graceful degradation behavior | 15-notification-admin-ui |
| **Added** | Rule management page specification with ASCII wireframe for create/edit form including condition builder, template picker, channel selector, suppression configuration, and cross-service validation feedback | 15-notification-admin-ui |
| **Added** | Template editor page specification with ASCII wireframe showing TipTap WYSIWYG editor, live preview panel, variable detection, and channel-specific editors (email HTML, SMS 160-char, WhatsApp 4096-char, push structured form) | 15-notification-admin-ui |
| **Added** | Event mapping editor page specification with ASCII wireframe showing field mapping table, test panel with Monaco editor for JSON input, and normalized output display | 15-notification-admin-ui |
| **Added** | Bulk upload page specification with ASCII wireframe for drag-and-drop upload zone, progress bar with real-time polling, and upload history table | 15-notification-admin-ui |
| **Added** | Notification detail page specification with ASCII wireframe showing lifecycle timeline, rendered content preview, and delivery attempt history | 15-notification-admin-ui |
| **Added** | Authentication flow diagram with token refresh mechanism (proactive refresh at 13-minute mark, 401 interceptor with single retry, replay detection handling) | 15-notification-admin-ui |
| **Added** | RBAC UI visibility matrix: 4 roles (Super Admin, Admin, Operator, Viewer) × 20+ UI elements with Show/Hidden/Read-only states | 15-notification-admin-ui |
| **Added** | SWR data fetching architecture diagram with SSR prefetch pattern (server components fetch during SSR, serialize as SWR fallback, client hydrates instantly) | 15-notification-admin-ui |
| **Added** | 4 flowcharts: rule creation end-to-end (client validation → API call → server validation → success/error), template save with version creation, bulk upload processing with polling loop, mapping test with JSON validation | 15-notification-admin-ui |
| **Added** | 5 sequence diagrams: local login (form → Gateway → Admin Service → JWT), SSO login (SSO button → Gateway redirect → Azure AD → SAML callback → JWT), dashboard SSR prefetch (server component → refresh token → fetch → HTML with fallback → client hydration → SWR polling), template live preview (debounced editor → API → Template Service render → preview update), token refresh with 401 recovery (expired request → 401 → refresh → retry → success) | 15-notification-admin-ui |
| **Added** | UI data model entity relationship diagram showing logical relationships between NotificationRule, Template, TemplateVersion, Notification, Channel, EventMapping, BulkUpload, RecipientGroup, and DashboardStats | 15-notification-admin-ui |
| **Added** | Cross-reference callout added after Notification Admin UI section linking to the new deep-dive document | 02-detailed-microservices |
| **Added** | Edge Layer description updated with cross-reference to new deep-dive document | 03-system-architecture |
| **Added** | Documentation card for doc 15 added to hub page | index |
| **Changed** | Index hub page version bumped to 2.2, date updated to 2026-02-21, doc 15 card added | index |
| **Changed** | CLAUDE.md updated with doc 15 in documentation file listing | CLAUDE.md |

---

## Version 3.5 — 2026-02-21

**Admin Service Deep-Dive**

Adds a comprehensive standalone deep-dive document for the Admin Service (Backoffice Administration). Covers the user management lifecycle with 4-state state machine (Active, Locked, Deactivated, Password Reset Pending), password policy enforcement (bcrypt cost 12, 12+ char complexity, history of 5, 90-day max age, 5-attempt lockout), RBAC permission matrix with 4 predefined roles (Super Admin, Admin, Operator, Viewer) across 16 resource-action categories, cross-service notification rule validation pipeline (event type existence via Event Ingestion, template existence via Template Service, channel availability via Channel Router, suppression config structural validation), event mapping management with RabbitMQ cache invalidation via `xch.config.events` exchange (`config.mapping.*` routing keys), template management delegation (transparent proxy to Template Service), channel configuration management with credential masking and optional connectivity dry-run, recipient group management (static member lists and dynamic criteria-based groups), system configuration key-value store (retention, feature flags, rate limits, provider defaults), dashboard data aggregation with parallel fan-out queries to 4 downstream services and graceful degradation (partial results with `degraded` flag), RabbitMQ config invalidation topology with 9 routing keys across 3 categories (mapping, rule, override), SAML 2.0 Identity Provider management (metadata XML import, attribute mapping, auto-provisioning, SP keypair generation), comprehensive REST API documentation across 10 categories (users, rules, event mappings, channels, recipient groups, dashboard, system config, SAML IdP, audit logs, health), database design with 7 tables (admin_users with password history and lockout, admin_roles with permission JSONB and hierarchy level, admin_permissions as resource-action catalog, system_configs with value type hints, saml_identity_providers with encrypted SP private keys, user_identity_links with cascading delete, saml_sessions for SLO support), ERD diagram, growth estimates (~100 MB max projected), 4 sequence diagrams (admin login with bcrypt validation, rule creation with cross-service validation fan-out, mapping update with RabbitMQ cache invalidation, dashboard aggregation with parallel fan-out), error handling with downstream failure strategies, security considerations (authentication boundary, SAML security, credential encryption at rest with AES-256-GCM, audit logging, input validation), 14 monitoring metrics, and 20+ environment variables. Existing docs updated with cross-reference callouts, index card, and CLAUDE.md listing.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | 14 — Admin Service Deep-Dive document (MD) with 19 sections covering service overview, architecture & integration points, user management, RBAC, notification rule management, event mapping management, template management delegation, channel configuration management, recipient group management, system configuration, dashboard data aggregation, RabbitMQ config invalidation topology, REST API endpoints (10 categories), database design (7 tables), sequence diagrams (4), error handling, security considerations, monitoring & health checks, and configuration | 14-admin-service |
| **Added** | User management lifecycle flowchart with 6-step creation pipeline and 4-state state machine (Active, Locked, Deactivated, Password Reset Pending) | 14-admin-service |
| **Added** | RBAC permission matrix with 4 roles × 16 resource-action categories and permission enforcement pipeline flowchart | 14-admin-service |
| **Added** | Cross-service rule validation pipeline flowchart: event type check (Event Ingestion) → template check (Template Service) → channel check (Channel Router) → suppression validation → forward to Notification Engine → publish cache invalidation | 14-admin-service |
| **Added** | Event mapping CRUD with cache invalidation flowchart and mapping test endpoint dry-run flow | 14-admin-service |
| **Added** | Channel configuration management with credential masking patterns and optional connectivity dry-run | 14-admin-service |
| **Added** | Recipient group management with static (explicit member lists) and dynamic (criteria-based) group types | 14-admin-service |
| **Added** | Dashboard data aggregation with parallel fan-out flow and graceful degradation (partial results with `degraded` flag and `unavailableServices` list) | 14-admin-service |
| **Added** | RabbitMQ config invalidation topology: `xch.config.events` exchange with 9 routing keys across 3 categories (`config.mapping.*`, `config.rule.*`, `config.override.*`) consumed by Event Ingestion and Notification Engine caches | 14-admin-service |
| **Added** | Database design with 7 tables: `admin_users` (with password_history JSONB, failed_login_attempts, locked_until), `admin_roles` (with permissions JSONB and hierarchy level), `admin_permissions` (resource-action catalog), `system_configs` (key-value with value_type hints), `saml_identity_providers` (with encrypted sp_private_key, auto_provision, default_role_id), `user_identity_links` (with CASCADE delete), `saml_sessions` (for SLO support) | 14-admin-service |
| **Added** | ERD diagram showing relationships between admin_users → admin_roles, admin_users → user_identity_links → saml_identity_providers, admin_users → saml_sessions → saml_identity_providers | 14-admin-service |
| **Added** | 4 sequence diagrams: admin login (local auth with bcrypt validation, JWT issuance), rule creation (cross-service validation with 4 downstream checks, cache invalidation), mapping update (forward to Event Ingestion, RabbitMQ cache invalidation, consumer reload), dashboard aggregation (parallel fan-out to 4 services, response assembly) | 14-admin-service |
| **Added** | 14 monitoring metrics: login totals/failures, account lockouts, CRUD operations, downstream errors/latency, dashboard latency/degradation, config publish totals/failures, active users, SAML assertions, DB pool | 14-admin-service |
| **Added** | 20+ environment variables covering port, database, RabbitMQ, JWT, bcrypt, password policy, lockout, downstream timeouts, SAML, config invalidation, logging, health checks, credential encryption | 14-admin-service |
| **Added** | Cross-reference callout added after Admin Service section linking to the new deep-dive document | 02-detailed-microservices |
| **Added** | Cross-reference callout added after entity relationships section linking to admin_service design | 03-system-architecture |
| **Added** | Documentation card for doc 14 added to hub page | index |
| **Changed** | Index hub page version bumped to 2.1, date updated to 2026-02-21, doc 14 card added | index |
| **Changed** | CLAUDE.md updated with doc 14 in documentation file listing | CLAUDE.md |

---

## Version 3.4 — 2026-02-21

**Notification Gateway Deep-Dive**

Adds a comprehensive standalone deep-dive document for the Notification Gateway (BFF/API Gateway). Covers the 7-step request processing pipeline (CORS, correlation ID, authentication, authorization, rate limiting, validation, proxy & transform), two-tier authentication model (JWT bearer tokens for admin users with RS256 signature verification and refresh token rotation with replay detection; API key authentication for external integrations with SHA-256 hashing, endpoint scoping, and key rotation with grace periods), role-based access control with declarative endpoint-to-role mapping for all 4 roles (Super Admin, Admin, Operator, Viewer) plus API key scoping, URL-based API versioning (`/api/v1/`) with deprecation headers, service proxy layer with per-service circuit breakers (configurable failure threshold, cooldown, half-open test), Axios-based HTTP forwarding with header propagation (`X-Correlation-ID`, `X-User-ID`, `X-User-Role`, `X-Service-Signature`), multipart streaming for bulk upload, multi-layer sliding window rate limiting (global per-IP, per-user, per-API-key, per-endpoint overrides with Redis upgrade path), request validation using NestJS class-validator DTOs with field-level error responses, response envelope transformation (`{ data, meta, errors }`) with consistent HTTP status code mapping, CORS configuration with credentials support and explicit origin allowlist, comprehensive REST API endpoint documentation across 13 categories (auth, SAML SSO, notifications, templates, rules, channels, event mappings, bulk upload, email ingest, audit/dashboard, user management, API key management, health), database design with 4 tables (`api_keys`, `sessions`, `rate_limits`, `token_blacklist`) including indexes and growth estimates, 5 sequence diagrams (admin login, authenticated proxy, token refresh with replay detection, API key request, downstream circuit breaker trip and recovery), error handling with centralized exception filters and structured logging, security considerations (JWT key security, timing-safe API key comparison, header injection prevention, request smuggling protection), 14 monitoring metrics, and 35+ environment variables. Existing docs updated with cross-reference callouts, index card, and CLAUDE.md listing.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | 13 — Notification Gateway Deep-Dive document (MD) with 17 sections covering service overview, architecture & integration points, request processing pipeline, authentication & authorization (JWT + API key), API versioning & routing, service proxy layer, rate limiting, request validation, response transformation, CORS configuration, REST API endpoints (13 categories), database design (4 tables), sequence diagrams (5), error handling, security considerations, monitoring & health checks, and configuration | 13-notification-gateway |
| **Added** | 7-step request processing pipeline flowchart: CORS → Correlation ID → Authentication → Authorization → Rate Limiting → Validation → Proxy & Transform | 13-notification-gateway |
| **Added** | JWT validation flow diagram with RS256 signature verification, expiry check, issuer validation, and token blacklist lookup | 13-notification-gateway |
| **Added** | API key validation flow diagram with SHA-256 hash lookup, active/expiry check, and endpoint scope verification | 13-notification-gateway |
| **Added** | RBAC endpoint-to-role mapping table covering all gateway endpoints across 4 roles + API key scoping | 13-notification-gateway |
| **Added** | Service proxy layer with per-service circuit breaker state machine (CLOSED → OPEN → HALF_OPEN) and configuration | 13-notification-gateway |
| **Added** | Multi-layer rate limiting architecture: global per-IP, per-user, per-API-key, per-endpoint overrides with sliding window counter algorithm | 13-notification-gateway |
| **Added** | Response envelope transformation (`{ data, meta, errors }`) with HTTP status code mapping table (14 scenarios) | 13-notification-gateway |
| **Added** | Database design with 4 tables: `api_keys` (external API key management with SHA-256 hashing and endpoint scoping), `sessions` (refresh token sessions with token family rotation tracking), `rate_limits` (sliding window counters), `token_blacklist` (revoked JWT tracking with automatic cleanup) | 13-notification-gateway |
| **Added** | 5 sequence diagrams: admin login flow (local auth), authenticated API request proxy, token refresh with replay detection, API key external integration request, downstream service failure with circuit breaker trip and recovery | 13-notification-gateway |
| **Added** | API key management endpoints: list, create, update, revoke, rotate with grace period | 13-notification-gateway |
| **Added** | 14 monitoring metrics: request counters, duration histograms, auth failures, rate limit hits, circuit breaker state/trips, active sessions, API keys, proxy retries/timeouts, token refresh, replay detection | 13-notification-gateway |
| **Added** | 35+ environment variables covering port, JWT, CORS, rate limiting, proxy, circuit breaker, service URLs, SAML, and logging | 13-notification-gateway |
| **Added** | Cross-reference callout added after Notification Gateway section linking to the new deep-dive document | 02-detailed-microservices |
| **Added** | Cross-reference callout added after database architecture section linking to notification_gateway deep-dive | 03-system-architecture |
| **Added** | Documentation card for doc 13 added to hub page | index |
| **Added** | Documentation card for doc 12 added to hub page (previously missing) | index |
| **Changed** | Index hub page version bumped to 2.0, date updated to 2026-02-21, doc 13 card added | index |
| **Changed** | CLAUDE.md updated with doc 13 in documentation file listing | CLAUDE.md |

---

## Version 3.3 — 2026-02-21

**RabbitMQ Topology Reference**

Adds a consolidated, authoritative RabbitMQ topology reference document and an importable RabbitMQ definitions JSON file. The Markdown document covers all 6 exchanges, 23 queues (22 service queues + 1 central DLQ), 24 bindings, routing key patterns, dead-letter configuration, consumer allocation summaries, retry configuration per service, and a system-wide ASCII message flow diagram — all scoped to vhost `vhnotificationapi`. The definitions JSON (`rabbitmq/definitions.json`) is importable via the RabbitMQ Management UI, `rabbitmqadmin`, or `management.load_definitions` config. Previously this topology was spread across docs 02, 03, 07, 08, 09, 10, and 11; this document consolidates it into a single source of truth.

| Type | Description | Affected Document(s) |
|---|---|---|
| **Added** | 12 — RabbitMQ Topology reference document (MD) with 12 sections covering overview, vhost, exchanges (6), queues (23), bindings (24), routing key reference, dead-letter configuration, consumer allocation summary, retry configuration per service, system-wide message flow diagram, importable definitions file reference, and topology counts summary | 12-rabbitmq-topology |
| **Added** | `rabbitmq/definitions.json` — importable RabbitMQ definitions file with vhost `vhnotificationapi`, 6 exchanges, 23 queues (with DLX arguments), and 24 bindings | rabbitmq/definitions.json |
| **Added** | Documentation card for doc 12 added to CLAUDE.md docs listing | CLAUDE.md |

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

*Notification API Documentation v3.6 -- Architecture Team -- 2026*
