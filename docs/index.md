# Notification API

**Unified Notification Platform — Documentation Hub**

| | |
|---|---|
| **Version:** | 2.3 |
| **Date:** | 2026-02-21 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Project Overview

The Notification API is a unified event-driven platform designed to consolidate the fragmented notification landscape across our eCommerce ecosystem. Today, customer-facing notifications originate independently from multiple source systems — each with its own delivery logic, templates, and provider integrations. This platform replaces that patchwork with a single, centralized microservices system capable of ingesting events from any registered source system via REST webhooks, direct RabbitMQ publishing, or email ingestion — and orchestrating multi-channel delivery across Email, WhatsApp, SMS, and Push Notifications. New source systems are onboarded through runtime mapping configuration in the Admin UI, requiring no code changes. The result is a consistent customer communication experience, a self-service backoffice for the operative team, centralized template management with versioning, and a complete audit trail for every notification sent.

> **Info:** **Architecture Highlights**
>
> Event-driven microservices architecture built with NestJS, Next.js, RabbitMQ, and PostgreSQL. Supports Email, WhatsApp, SMS, and Push Notification channels with extensible provider integrations. Each microservice owns its own database, communicates asynchronously through RabbitMQ exchanges, and is independently deployable via Docker containers. The system is designed for horizontal scalability, provider failover, and zero-downtime deployments.

---

## Key Capabilities

The platform delivers six core capabilities that together provide end-to-end notification lifecycle management — from event ingestion through delivery, tracking, and analytics.

### Unified Event Ingestion

Consolidates events from any registered source system into a standardized canonical event schema (v2.0). Source systems integrate via REST webhooks or direct RabbitMQ publishing, while closed/legacy systems that can only send email are integrated through a dedicated Email Ingest Service. Runtime field mapping configurations — managed through the Admin UI — normalize incoming payloads without code changes. The ingestion layer validates, deduplicates, and routes all events downstream.

### Multi-Channel Delivery

Delivers notifications across Email, SMS, WhatsApp, and Push Notification channels through pluggable provider adapters. Integrates with SendGrid, Twilio, WhatsApp Business API, and Firebase Cloud Messaging with built-in retry logic and provider failover.

### Template Management

Handlebars-based template engine supporting multi-channel variants, localization, and version history. Templates are managed through the backoffice with a live preview, ensuring the operative team can update notification content without code deployments.

### Rule-Based Routing

Configurable event-to-notification mapping rules with conditional logic. Rules define which events trigger which notifications, on which channels, with support for customer preference overrides, time-based scheduling, and priority escalation.

### Backoffice Administration

Self-service Next.js admin interface for the operative team to manage templates, routing rules, channel configurations, and provider settings. Role-based access control ensures appropriate permissions across teams and functions.

### Audit & Analytics

Complete notification lifecycle tracking from event ingestion to final delivery status. Captures delivery receipts, open rates, failure reasons, and retry history. Provides dashboards for delivery analytics, channel performance, and system health monitoring.

---

## Technology Stack

| Technology | Purpose |
|---|---|
| NestJS | Backend microservices framework providing modular architecture, dependency injection, and native RabbitMQ transport support |
| Next.js | Admin backoffice frontend with server-side rendering, API routes, and role-based access control |
| RabbitMQ | Message broker for asynchronous inter-service communication, event fan-out, and delivery queue management |
| PostgreSQL | Relational databases with per-service isolation for events, templates, routing rules, and notification logs |
| Docker | Containerization for consistent local development, CI/CD pipelines, and production deployment orchestration |
| Jest / Playwright / Allure | Testing stack: Jest for unit tests (NestJS + Next.js), Playwright for cross-browser E2E, Allure for unified reporting |

---

## Documentation

Explore the detailed design documentation below. Each document covers a specific aspect of the platform architecture and implementation.

### 01 — Executive Summary

Project overview, problem statement, proposed solution, objectives, technology stack, and benefits of the unified notification platform.

[Read Executive Summary](01-executive-summary.md)

### 02 — Detailed Microservices

In-depth specification of each microservice including API endpoints, database schemas, RabbitMQ configuration, and inter-service communication.

[Read Detailed Microservices](02-detailed-microservices.md)

### 03 — System Architecture

Architecture diagrams, layer design, event flows, RabbitMQ topology, database architecture, security, scalability, and deployment patterns.

[Read System Architecture](03-system-architecture.md)

### 04 — Authentication & Identity

Local authentication, SAML 2.0 SSO with Azure AD, JWT session management, account linking, database schema additions, and security considerations.

[Read Authentication & Identity](04-authentication-identity.md)

### 05 — Testing Strategy

Jest unit testing, Playwright frontend E2E, backend E2E scaffolding, Allure reporting, CI/CD integration, and quality gates.

[Read Testing Strategy](05-testing-strategy.md)

### 06 — Changelog

Documentation and feature change log tracking all notable additions, changes, fixes, and removals across versions.

[Read Changelog](06-changelog.md)

### 07 — Event Ingestion Service

Deep-dive into the Event Ingestion Service — generic source integration, runtime mapping configuration, processing pipeline, RabbitMQ topology, REST API, idempotency, and sequence diagrams.

[Read Event Ingestion Service](07-event-ingestion-service.md)

### 08 — Notification Engine Service

Deep-dive into the Notification Engine Service — rule engine with condition operators, recipient resolution, suppression query optimization, template rendering coordination, priority management, RabbitMQ topology, REST API, database design with FILLFACTOR and VACUUM tuning, notification lifecycle state machine, sequence diagrams, horizontal scalability, rule caching, asynchronous status logging, and performance strategies.

[Read Notification Engine Service](08-notification-engine-service.md)

### 09 — Bulk Upload Service

Deep-dive into the Bulk Upload Service — asynchronous XLSX file processing, three-endpoint upload lifecycle (upload, poll status, download result), result file generation with per-row submission status column, flexible column mapping, Event Ingestion integration via HTTP, fire-and-forget audit logging via RabbitMQ, circuit breaker for downstream resilience, database design, sequence diagrams, and configuration.

[Read Bulk Upload Service](09-bulk-upload-service.md)

### 10 — Template Service

Deep-dive into the Template Service — Handlebars rendering pipeline with compiled template caching, immutable versioning model, variable auto-detection, custom helpers, multi-channel content specifications (email HTML, SMS, WhatsApp, push), performance evaluation (PostgreSQL vs DynamoDB/MongoDB/Redis), fire-and-forget audit logging via RabbitMQ, REST API contracts, database design with 4 tables, media pass-through architecture, sequence diagrams, security considerations (HTML escaping, XSS prevention, RBAC), and configuration.

[Read Template Service](10-template-service.md)

### 11 — Channel Router Service

Deep-dive into the Channel Router Service — provider strategy pattern with multi-provider support (SendGrid, Mailgun, Braze, Twilio, FCM), dumb-pipe integration architecture, delivery pipeline, token bucket rate limiting, circuit breaker pattern, retry strategy with exponential backoff and jitter, fallback channel logic, media and attachment handling, webhook receivers with provider signature verification, Braze user profile synchronization, asynchronous audit logging via RabbitMQ fire-and-forget, database design with 4 tables, sequence diagrams (email delivery, Braze multi-channel, retry with circuit breaker trip, fallback), and configuration.

[Read Channel Router Service](11-channel-router-service.md)

### 12 — RabbitMQ Topology

Consolidated RabbitMQ topology reference — exchanges, queues, bindings, routing keys, dead-letter configuration, consumer allocation, retry configuration, and importable definitions file.

[Read RabbitMQ Topology](12-rabbitmq-topology.md)

### 13 — Notification Gateway

Deep-dive into the Notification Gateway (BFF/API Gateway) — 7-step request processing pipeline, JWT and API key authentication, RBAC with endpoint-to-role mapping, sliding window rate limiting, service proxy layer with per-service circuit breakers, request validation, response envelope transformation, CORS configuration, database design with 4 tables (api_keys, sessions, rate_limits, token_blacklist), sequence diagrams (login, proxy, token refresh, API key, circuit breaker), error handling, security considerations, monitoring metrics, and configuration.

[Read Notification Gateway](13-notification-gateway.md)

### 14 — Admin Service

Deep-dive into the Admin Service (Backoffice Administration) — user management lifecycle with RBAC (4 roles: Super Admin, Admin, Operator, Viewer), cross-service notification rule validation pipeline, event mapping management with RabbitMQ cache invalidation, template management delegation, channel configuration with credential masking and connectivity dry-run, recipient group management (static and dynamic), system configuration key-value store, dashboard data aggregation with parallel fan-out and graceful degradation, RabbitMQ config invalidation topology (xch.config.events exchange), SAML 2.0 IdP management, database design with 7 tables, sequence diagrams (login, rule creation, mapping update, dashboard aggregation), error handling, security considerations, and configuration.

[Read Admin Service](14-admin-service.md)

### 15 — Notification Admin UI

Deep-dive into the Notification Admin UI (Next.js Frontend) — Next.js 14 App Router architecture with TypeScript, technology stack (TipTap WYSIWYG, SWR data fetching, Tailwind CSS, Radix UI, React Hook Form, Recharts, Monaco Editor), application folder structure, authentication and session management (in-memory access tokens with proactive refresh and 401 recovery), RBAC UI visibility matrix (4 roles across 20+ UI elements), SWR data fetching with SSR prefetch fallback, 12 page specifications with ASCII wireframes (dashboard, rules, templates, channels, logs, event mappings, bulk upload, users, recipient groups, audit, settings, identity providers), component architecture hierarchy, API integration layer with 60+ Gateway endpoint mappings, routing table with role-based access, flowcharts (rule creation, template save, bulk upload processing, mapping test), sequence diagrams (local login, SSO login, dashboard SSR prefetch, template live preview, token refresh with 401 recovery), UI data model entity relationships, error handling with two-tier form validation, accessibility (WCAG 2.1 AA), responsive design, testing strategy, security considerations, monitoring, and deployment.

[Read Notification Admin UI](15-notification-admin-ui.md)

### 16 — Audit Service

Deep-dive into the Audit Service — event sourcing model with append-only immutable audit trail, multi-source event capture pipeline (5 RabbitMQ consumers with batch insert optimization), delivery receipt correlation via `provider_message_id`, end-to-end notification trace reconstruction, analytics aggregation engine with hourly/daily rollups, full-text search using PostgreSQL `tsvector`/`tsquery`, dead-letter queue monitoring with investigation and reprocessing support, two-tier data retention and purge strategy (90-day payload / 2-year metadata), GDPR compliance (Right to Erasure anonymization, Right of Access export), database design with 4 tables (`audit_events`, `delivery_receipts`, `notification_analytics`, `dlq_entries`), 4 sequence diagrams (full lifecycle accumulation, delivery receipt correlation, analytics aggregation, DLQ capture and reprocessing), error handling with consumer resilience, security considerations, monitoring metrics, and configuration.

[Read Audit Service](16-audit-service.md)

### 17 — Provider Adapter Services

Deep-dive into the Provider Adapter Services — NestJS monorepo with 4 stateless adapter microservices (Mailgun, Braze, WhatsApp/Meta, AWS SES), standardized HTTP contract (SendRequest/SendResult), webhook architecture with signature verification and event normalization, shared infrastructure library, error classification, media handling per adapter, and registration in core services.

[Read Provider Adapter Services](17-provider-adapters.md)

### 18 — Auth/RBAC Architecture Addendum

Addendum documenting the decoupling of authentication and RBAC into a standalone multi-application service. Covers motivation, architectural changes summary, new services (3), gateway removal with responsibility redistribution, admin-service simplification, auth token flow (platform + app-scoped JWTs), RS256 key distribution, impact on existing services, updated port table, and webhook routing migration.

[Read Auth/RBAC Architecture Addendum](18-auth-rbac-architecture-addendum.md)

### 19 — Auth RBAC Service Backend

Deep-dive into the Auth RBAC Service Backend — multi-application authentication and RBAC hub with RS256 JWT issuance, user lifecycle management, application registration, per-application roles with hierarchy and permissions as resource+action pairs, refresh token rotation with replay detection, password policy enforcement with history tracking, database design with 9 tables, 35+ REST API endpoints, and 4 sequence diagrams.

[Read Auth RBAC Service Backend](19-auth-rbac-service-backend.md)

### 20 — Auth RBAC Service Frontend

Deep-dive into the Auth RBAC Service Frontend — Next.js 14 admin interface for managing the centralized auth/RBAC system, self-authenticating via app-scoped JWT, application management with role/permission tabs, user management with application assignment, 7 page specifications with wireframes.

[Read Auth RBAC Service Frontend](20-auth-rbac-service-frontend.md)

### 21 — eCommerce Backoffice

Deep-dive into the eCommerce Backoffice — Next.js 14 login portal and application launcher serving as the single entry point for all platform users, two-token authentication flow, proactive session management, password recovery, 4 page specifications with wireframes.

[Read eCommerce Backoffice](21-ecommerce-backoffice.md)

---

*Notification API Documentation v2.4 -- Architecture Team -- 2026*
