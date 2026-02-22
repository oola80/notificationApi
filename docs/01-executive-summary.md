# 01 -- Executive Summary

**Notification API -- Project Overview**

| | |
|---|---|
| **Version:** | 1.0 |
| **Date:** | 2026-02-19 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Problem Statement](#2-problem-statement)
3. [Proposed Solution](#3-proposed-solution)
4. [Key Objectives](#4-key-objectives)
5. [Solution Overview](#5-solution-overview)
6. [Technology Stack](#6-technology-stack)
7. [Microservices Overview](#7-microservices-overview)
8. [Benefits](#8-benefits)
9. [Scope & Constraints](#9-scope--constraints)
10. [Next Steps](#10-next-steps)

---

## 1. Introduction

The **Notification API** project is a strategic initiative to build a unified, centralized notification platform for our eCommerce ecosystem. As the business has grown, customer-facing notifications -- order confirmations, shipping updates, promotional messages, and operational alerts -- have become fragmented across multiple disconnected systems, each with its own logic, templates, and delivery mechanisms.

This document provides a high-level executive summary of the project: the business problem it addresses, the proposed architectural solution, the technology choices made, and the expected benefits. It is intended for stakeholders, project sponsors, and technical leadership to gain a clear understanding of the project's scope, direction, and value proposition.

> **Purpose:** Establish a single, event-driven platform that consolidates all notification channels (Email, WhatsApp, SMS, Push Notifications) under one manageable system with centralized configuration, template management, and delivery tracking.

---

## 2. Problem Statement

Today, customer notifications originate from five independent source systems, each operating in isolation with no shared infrastructure for message composition, delivery, or tracking. This fragmentation creates significant operational and customer experience challenges.

### 2.1 Current Notification Sources

| Source System | Type | Notification Method | Key Issues |
|---|---|---|---|
| **OMS** (Order Management System) | In-house | Direct email via SMTP, ad-hoc triggers | Hardcoded templates, no retry logic, no delivery tracking |
| **Magento 2** | eCommerce Platform | Built-in transactional emails | Limited to email only, difficult to customize, tightly coupled to platform |
| **Mirakl Marketplace** | Marketplace Platform | Platform-native notifications | Separate branding, no integration with other channels, limited configurability |
| **Chat Commerce Solution** | Conversational Commerce | WhatsApp and chat-based messages | Siloed from transactional flows, no unified customer view |
| **Manual Notifications** | Operational | Manual emails, spreadsheets, ad-hoc SMS | Error-prone, unscalable, no audit trail, inconsistent messaging |
| **Closed/Legacy Systems** | Legacy / ERP | Email-only output (SMTP) | Cannot publish events via API or message broker; limited to sending emails. No structured event data, no webhook support |

### 2.2 Core Challenges

> **Warning:** Critical Pain Points:
>
> - **Inconsistent Customer Experience:** Customers receive notifications with different branding, tone, and formatting depending on which system triggers the message. There is no unified voice.
> - **No Centralized Control:** Business teams cannot manage notification rules, templates, or recipient preferences from a single interface. Changes require developer intervention across multiple codebases.
> - **Limited Channel Coverage:** Most systems only support email. WhatsApp, SMS, and push notifications are either absent or handled by standalone tools with no coordination.
> - **Zero Visibility:** There is no consolidated view of what notifications were sent, to whom, through which channel, or whether they were delivered. Troubleshooting customer complaints is time-consuming and unreliable.
> - **Scalability Bottlenecks:** Hardcoded notification logic in source systems does not scale. Adding a new event type or channel requires changes in multiple places with significant lead time.
> - **Compliance and Audit Gaps:** Without centralized logging, meeting audit requirements for customer communication records is difficult and labor-intensive.

---

## 3. Proposed Solution

The Notification API is a **unified, event-driven notification platform** that decouples notification logic from source systems and centralizes it into a purpose-built set of microservices. Any registered source system integrates via REST webhook or direct AMQP, publishing business events (e.g., "order placed", "shipment dispatched", "payment failed") to the platform. Admin-configured runtime field mappings normalize each source's payload into a canonical format -- no code changes are needed to onboard new sources. The Notification API handles everything downstream: determining what to send, to whom, through which channel, using which template, and tracking the result.

### 3.1 Core Design Principles

#### Event-Driven Architecture

Any registered source system publishes events to RabbitMQ (direct AMQP) or sends them via REST webhook. The notification platform subscribes to relevant events and processes them asynchronously. This fully decouples producers from consumers, allowing each to evolve independently.

#### Single Point of Configuration

All notification rules, templates, channel preferences, and recipient mappings are managed centrally through an admin backoffice UI. Business users can make changes without developer involvement.

#### Multi-Channel Delivery

A unified channel routing layer abstracts away provider-specific integrations. Adding a new channel or switching providers (e.g., from SendGrid to Amazon SES) requires no changes to upstream services.

#### Observability by Design

Every notification is tracked end-to-end: from event ingestion through template rendering, channel routing, provider submission, and delivery receipt. Full audit trails are available for compliance and troubleshooting.

> **Success:** Source systems become simple event publishers, integrating via REST webhook or direct AMQP with admin-configured runtime field mappings. All notification intelligence -- what to send, when, to whom, and how -- lives in the Notification API platform, managed through a centralized admin interface. New sources can be onboarded entirely through admin configuration -- no code changes required.

---

## 4. Key Objectives

#### Unify Notification Sources

Consolidate notifications from any registered source system into a single platform. Sources integrate via REST webhook or direct AMQP, and admin-configured runtime field mappings normalize their payloads into a canonical format. New sources can be onboarded without code changes.

#### Standardize Messaging

Enforce consistent branding, tone, and formatting across all customer communications. Centralized template management ensures every message reflects the brand identity regardless of the originating system.

#### Improve Customer Communication

Deliver timely, relevant notifications through the customer's preferred channel -- Email, WhatsApp, SMS, or Push Notification -- with intelligent fallback routing when a primary channel is unavailable.

#### Enable Self-Service Configuration

Provide business and operations teams with an intuitive admin UI to manage notification rules, templates, recipient groups, and channel settings without requiring engineering support or code deployments.

#### Ensure Scalability & Reliability

Build on a microservices architecture with asynchronous message processing, automatic retries, circuit breakers, and horizontal scaling to handle peak traffic volumes reliably.

#### Complete Auditability

Track every notification from ingestion to delivery with full audit logs, delivery receipts, and analytics dashboards. Support compliance requirements and enable rapid incident investigation.

---

## 5. Solution Overview

The Notification API platform is composed of specialized microservices organized into four architectural layers. Each layer has a distinct responsibility, and communication between layers is mediated by RabbitMQ for asynchronous processing or REST APIs for synchronous operations.

### 5.1 Architectural Layers

| Layer | Purpose | Components |
|---|---|---|
| **Edge Layer** | API Gateway, BFF (Backend for Frontend), authentication, request validation, rate limiting | notification-gateway, notification-admin-ui |
| **Compute Layer** | Core business logic: event normalization, notification orchestration, template rendering, channel routing, email ingestion, administration | event-ingestion-service, notification-engine-service, template-service, channel-router-service, admin-service, audit-service, email-ingest-service |
| **Message Layer** | Asynchronous message brokering, event distribution, decoupling of producers and consumers | RabbitMQ (exchanges, queues, dead-letter queues) |
| **Data Layer** | Persistent storage for templates, rules, audit logs, configuration, and delivery records | PostgreSQL (per-service databases following database-per-service pattern) |

### 5.2 High-Level Flow

The following diagram illustrates the end-to-end notification flow, from source system events through the platform's processing pipeline to customer delivery.

```
Notification API -- High-Level Flow

+------------------+      +-------------------+      +-------------+      +-------------------+      +-----------------+      +-----------+
|  Source Systems   |      |  Event Ingestion  |      |  RabbitMQ   |      |   Notification    |      | Channel Router  |      | Customers |
|                   | ---> |                   | ---> |             | ---> |      Engine       | ---> |                 | ---> |           |
|  - OMS            |      |  Normalize &      |      |  Message    |      |                   |      | SendGrid/Twilio |      |           |
|  - Magento 2      |      |  Validate         |      |  Broker     |      | Rules &           |      | FCM / WhatsApp  |      |           |
|  - Mirakl         |      |  REST + RabbitMQ  |      |             |      | Orchestration     |      |                 |      |           |
|  - Chat Commerce  |      |                   |      |             |      | Template Rendering|      |                 |      |           |
|  - Manual         |      |                   |      |             |      | Recipient         |      |                 |      |           |
|  - Closed/Legacy  |      |                   |      |             |      | Resolution        |      |                 |      |           |
|    (via Email     |      |                   |      |             |      |                   |      |                 |      |           |
|     Ingest)       |      |                   |      |             |      |                   |      |                 |      |           |
+------------------+      +-------------------+      +-------------+      +-------------------+      +-----------------+      +-----------+
                                                                                  |                          |
                                                                                  v                          v
                                                                    +----------------------------+  +-------------------+
                                                                    | Admin Backoffice (Next.js) |  |  Audit Service    |
                                                                    | Rules, Templates, Channels |  |  Tracking &       |
                                                                    | Monitoring, Audit Logs     |  |  Analytics        |
                                                                    +----------------------------+  +-------------------+
```

> **Note:** Source systems are decoupled from the notification platform via RabbitMQ. They publish business events without knowledge of downstream notification logic. The Notification Engine applies configurable rules to determine what, when, and how to notify customers.

### 5.3 Event Flow Summary

1. **Event Publication:** Events arrive from any registered source system via direct AMQP or REST webhook to the Event Ingestion Service. Closed/legacy systems send emails to the Email Ingest Service, which parses them and generates standardized events.
2. **Event Normalization:** The Event Ingestion Service validates the incoming event payload, applies runtime mapping configuration to normalize it into the canonical event format (flat top-level namespace; values may be structured types such as arrays or nested objects), and publishes it to the appropriate RabbitMQ exchange. The runtime mapping engine handles source-specific field transformations without code changes.
3. **Orchestration:** The Notification Engine consumes the normalized event, evaluates notification rules (what templates to use, which recipients to notify, which channels to deliver through), and coordinates with the Template Service for message rendering.
4. **Template Rendering:** The Template Service resolves the appropriate template version, performs variable substitution with event data, and returns rendered content for each target channel.
5. **Channel Routing:** The Channel Router receives the rendered message and routes it to the appropriate delivery provider (SendGrid for email, Twilio for SMS/WhatsApp, Firebase Cloud Messaging for push notifications). Retry logic and circuit breakers ensure resilient delivery.
6. **Audit & Tracking:** The Audit Service records every step of the process, captures delivery receipts from providers, and makes data available for analytics and compliance reporting.

---

## 6. Technology Stack

The technology stack has been selected for its maturity, community support, team familiarity, and alignment with the event-driven microservices architecture. All components are well-established in production environments and offer strong tooling for development, testing, and operations.

| Technology | Category | Purpose |
|---|---|---|
| **NestJS** | Backend Framework | Primary framework for all backend microservices. Provides a modular, TypeScript-first architecture with built-in support for microservices patterns, dependency injection, guards, interceptors, and RabbitMQ integration. |
| **Next.js** | Frontend Framework | Powers the Admin Backoffice UI (notification-admin-ui). Server-side rendering for fast initial loads, API routes for BFF patterns, and a rich React-based component ecosystem for building the admin dashboard. |
| **RabbitMQ** | Message Broker | Core messaging infrastructure for asynchronous event-driven communication between microservices. Provides exchanges, queues, dead-letter queues, and routing capabilities critical for reliable notification delivery. |
| **PostgreSQL** | Relational Database | Primary data store for all services following the database-per-service pattern. Stores templates, notification rules, audit logs, delivery records, configuration data, and user/role information. |
| **Docker** | Containerization | Containerization of all microservices for consistent development, testing, and deployment environments. Docker Compose for local development orchestration of the full service mesh. |
| **SendGrid** | Email Provider | Third-party email delivery service for transactional and marketing emails. Provides delivery tracking, bounce handling, and analytics via API integration in the Channel Router Service. |
| **Twilio** | SMS / WhatsApp Provider | Third-party provider for SMS and WhatsApp message delivery. Supports message templating, delivery receipts, and two-way messaging via the Twilio Messaging API. |
| **Firebase Cloud Messaging (FCM)** | Push Notification Provider | Google's push notification service for delivering notifications to mobile devices (iOS and Android) and web browsers. Integrated via the Channel Router Service for real-time customer alerts. |
| **TypeScript** | Programming Language | Shared language across all backend services (NestJS) and the frontend (Next.js). Provides type safety, improved developer experience, and consistent tooling across the entire platform. |
| **Jest** | Unit Testing | Unit testing framework for all NestJS backend services (with ts-jest and @nestjs/testing) and the Next.js frontend (with @testing-library/react). Coverage thresholds enforced per service. |
| **Playwright** | Frontend E2E Testing | Cross-browser end-to-end testing for the Admin UI. Tests critical user journeys across Chromium, Firefox, and WebKit with the Page Object Model pattern. |
| **Allure** | Test Reporting | Unified test reporting aggregating results from Jest unit tests, Playwright E2E, and backend E2E tests. Provides history trends, failure categorization, and step-by-step breakdowns. See [05 — Testing Strategy](05-testing-strategy.md). |

---

## 7. Microservices Overview

The platform is decomposed into ten microservices, each with a single well-defined responsibility. Services communicate asynchronously via RabbitMQ for event-driven flows and synchronously via REST for query and configuration operations.

| Service | Responsibility | Tech | Communication |
|---|---|---|---|
| **notification-gateway** | API Gateway and BFF (Backend for Frontend). Exposes REST endpoints for the admin UI, handles authentication and authorization, validates incoming requests, and routes them to the appropriate backend services. | NestJS | REST (inbound), REST (outbound to services) |
| **event-ingestion-service** | Receives events from any registered source, applies runtime field mappings, normalizes to canonical format, and publishes them for downstream processing. Sources integrate via direct AMQP or REST webhook; new sources are onboarded through admin configuration without code changes. | NestJS | RabbitMQ (inbound/outbound), REST (webhooks) |
| **notification-engine-service** | Core orchestrator. Consumes normalized events, evaluates notification rules, resolves recipients, coordinates template rendering with the Template Service, and dispatches delivery requests to the Channel Router. | NestJS | RabbitMQ (inbound/outbound), REST (Template Service) |
| **template-service** | CRUD management for message templates. Supports variable substitution, multi-channel template variants (email HTML, SMS plain text, WhatsApp structured), template versioning, and preview rendering. | NestJS | REST (inbound from Engine and Admin) |
| **channel-router-service** | Routes rendered notifications to the appropriate delivery channel and provider. Integrates with SendGrid, Twilio, and FCM. Implements retry logic with exponential backoff and circuit breakers for provider resilience. | NestJS | RabbitMQ (inbound), REST (provider APIs) |
| **admin-service** | Backoffice administration backend. Manages notification rules, channel configuration, template assignments, recipient groups, and system settings. Serves as the data layer for the Admin UI. | NestJS | REST (inbound from Gateway) |
| **audit-service** | Notification lifecycle tracking. Records delivery attempts, captures provider receipts, stores status updates, and provides data for analytics dashboards and compliance reporting. | NestJS | RabbitMQ (inbound events), REST (query API) |
| **email-ingest-service** | SMTP ingest for closed/legacy systems. Receives emails on port 2525, parses them against configurable rules, extracts structured data, and generates standardized events for the ingestion layer. Enables any system that can send email to become an event source. | NestJS | SMTP (inbound), RabbitMQ (outbound), REST (admin API on port 3157) |
| **bulk-upload-service** | Accepts XLSX file uploads from the Admin UI, parses each row into an event payload, and submits events to the Event Ingestion Service via HTTP. Enables the operative team to trigger bulk notifications from spreadsheet files. | NestJS | REST (inbound from Gateway), HTTP (outbound to Event Ingestion) |
| **notification-admin-ui** | Admin backoffice frontend. Provides dashboards for notification monitoring, template editor, rule configuration, channel management, recipient group management, and audit log viewer. | Next.js | REST (outbound to Gateway) |

> **Info:** **Database Strategy:** Each backend service owns its own PostgreSQL database (database-per-service pattern). Services never access another service's database directly -- all inter-service data access is through well-defined APIs or event-driven messaging. This ensures loose coupling and independent deployability.

---

## 8. Benefits

The Notification API platform delivers measurable value across customer experience, operational efficiency, and technical capability.

#### Improved Customer Experience

Customers receive consistent, well-branded notifications across all channels. Timely delivery through their preferred channel (email, WhatsApp, SMS, or push) increases engagement and satisfaction. Intelligent fallback routing ensures messages are delivered even when a primary channel is unavailable.

#### Operational Efficiency

Business teams manage all notification configuration through a single admin interface. No more coordinating changes across five different systems. Template updates, rule changes, and channel adjustments are made in one place and take effect immediately without code deployments.

#### Horizontal Scalability

The microservices architecture allows individual services to scale independently based on load. During peak events (flash sales, order surges), the Channel Router and Notification Engine can scale out while other services remain at baseline capacity, optimizing infrastructure costs.

#### Full Auditability & Compliance

Every notification is tracked end-to-end with timestamps, delivery status, and provider responses. The Audit Service provides a complete, queryable record of all customer communications for compliance audits, dispute resolution, and operational troubleshooting.

#### Reduced Time-to-Market

Adding a new notification type (e.g., for a new order status or a new promotional campaign) requires only configuration changes in the admin UI: create a template, define a rule, and map it to an event. No code changes, no deployments, no cross-team coordination.

#### Provider Flexibility

The channel abstraction layer allows switching delivery providers (e.g., SendGrid to Amazon SES, or Twilio to Vonage) without affecting any other part of the system. This reduces vendor lock-in and enables cost optimization through competitive provider selection.

> **Success:** **Business Impact Summary:** The unified notification platform is projected to reduce notification-related development effort by approximately 60%, eliminate cross-system inconsistencies, provide complete delivery visibility for the first time, and enable business teams to independently manage notification workflows.

---

## 9. Scope & Constraints

### 9.1 In Scope (Phase 1)

| Area | Details |
|---|---|
| **Notification Channels** | Email (via SendGrid), SMS (via Twilio), WhatsApp (via Twilio), Push Notifications (via Firebase Cloud Messaging) |
| **Source System Integration** | Any registered source system via REST webhook or direct AMQP with admin-configured runtime field mappings. Initial sources include OMS, Magento 2, and Mirakl Marketplace. Closed/legacy system email integration via Email Ingest Service. New sources onboarded via admin configuration -- no code changes required. |
| **Core Event Types** | Order placed, order confirmed, order shipped, order delivered, payment received, payment failed, refund processed, shipment tracking update |
| **Admin Backoffice** | Template management (CRUD, versioning, preview), notification rule configuration, channel management, recipient group management, audit log viewer, delivery analytics dashboard |
| **Platform Infrastructure** | All nine microservices, RabbitMQ message broker setup, PostgreSQL databases (per-service), Docker containerization, API documentation |

### 9.2 Out of Scope (Phase 1)

> **Note:** Deferred to Future Phases:
>
> - Chat Commerce integration (Phase 2 -- requires separate API contract negotiation)
> - Advanced personalization and AI-driven send-time optimization
> - Customer preference center (self-service opt-in/opt-out portal)
> - Multi-language template support beyond English and Arabic
> - Real-time notification streaming (WebSocket-based live feeds)
> - Advanced analytics with machine learning-based delivery optimization

### 9.3 Constraints

| Constraint | Description | Mitigation |
|---|---|---|
| **Local Development Environment** | Development and testing will be conducted on local machines using Docker Compose. No dedicated cloud staging environment is available for Phase 1. | Docker Compose configurations will closely mirror production topology. Integration tests will validate service interactions locally. |
| **Existing Infrastructure Integration** | Source systems have varying API capabilities and event formats. Each source's payload structure may differ significantly. | The Event Ingestion Service uses a runtime mapping engine with admin-configured field mappings to normalize diverse input formats into a canonical schema. New sources can be onboarded via admin configuration without code changes. |
| **Provider Rate Limits** | SendGrid, Twilio, and FCM impose rate limits on API calls. High-volume notification bursts may be throttled. | The Channel Router implements rate-limiting queues, exponential backoff retry, and circuit breakers to manage provider throughput constraints gracefully. |
| **Team Capacity** | The engineering team will be working on the Notification API alongside ongoing maintenance of existing systems. | Phased delivery approach with clear milestones. Microservices architecture enables parallel development across service boundaries. |
| **Data Privacy & Compliance** | Customer contact data (email addresses, phone numbers) must be handled in compliance with data protection regulations. | Data minimization principles applied. Personally identifiable information (PII) is encrypted at rest. Audit logs redact sensitive fields. Access controls enforce least-privilege. |

---

## 10. Next Steps

With the executive vision and high-level architecture established, the following steps outline the path from this summary to a production-ready platform.

| Phase | Activity | Description | Target |
|---|---|---|---|
| **[In Review]** | **Detailed Design** | Produce detailed technical design documents for each microservice, including API contracts (OpenAPI specs), database schemas, RabbitMQ exchange/queue topology, and sequence diagrams for all core flows. | Weeks 1-3 |
| **[In Review]** | **Proof of Concept** | Build a working POC covering the critical path: Event Ingestion receives an OMS "order placed" event, Notification Engine processes it, Template Service renders an email, Channel Router delivers via SendGrid. Validates the architecture end-to-end. | Weeks 3-5 |
| **[In Review]** | **Core Service Implementation** | Develop the six backend microservices (event-ingestion, notification-engine, template-service, channel-router, admin-service, audit-service) with full functionality, Jest unit tests (>=80% coverage), and integration tests. See [05 — Testing Strategy](05-testing-strategy.md). | Weeks 5-12 |
| **[In Review]** | **Admin UI Development** | Build the Next.js admin backoffice with template editor, rule configuration, channel management, and audit log dashboards. Integrate with the notification-gateway API. | Weeks 8-14 |
| **[In Review]** | **Integration Testing** | End-to-end integration testing across all services in a Docker Compose environment using backend E2E scaffolding and Playwright for the Admin UI. Validate all event flows, template rendering, channel delivery, and audit tracking. Allure reporting aggregates all results. See [05 — Testing Strategy](05-testing-strategy.md). | Weeks 13-15 |
| **[In Review]** | **UAT & Go-Live** | User acceptance testing with business stakeholders. Performance testing under expected load. Production deployment and cutover from legacy notification paths. | Weeks 15-18 |

> **Success:** **Immediate Next Step:** Review and approve this executive summary. Once approved, the Architecture Team will proceed with the Detailed Microservices Design document ([02 -- Microservices Detail](02-detailed-microservices.md)) and the System Architecture document ([03 -- System Architecture](03-system-architecture.md)), which provide the technical depth required for implementation planning.

> **Warning:** **Decision Required:** Stakeholder approval of the proposed solution, technology stack, and Phase 1 scope is required before proceeding to detailed design. Any changes to scope, channels, or source system priority should be communicated to the Architecture Team before the detailed design phase begins.

---

*Notification API Documentation v1.0 -- Architecture Team -- 2026*
