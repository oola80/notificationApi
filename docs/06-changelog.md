# 06 — Changelog

**Notification API — Documentation & Feature Change Log**

| | |
|---|---|
| **Version:** | 1.3 |
| **Date:** | 2026-02-19 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## About This Changelog

This document tracks all notable changes to the Notification API documentation and feature design. The format follows [Keep a Changelog](https://keepachangelog.com/) conventions.

> **Info:** **Change Types**
>
> Each entry is categorized using one of the following types: **Added**, **Changed**, **Fixed**, **Removed**, **Deprecated**.

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
| **Added** | Bulk Upload Service row in Microservices Overview table (port 3008, `bulk_upload_db`) | 02-detailed-microservices |
| **Added** | Gateway proxy endpoints for bulk upload operations | 02-detailed-microservices |
| **Added** | Bulk Upload page (`/bulk-upload`) added to Admin UI Key Pages | 02-detailed-microservices |
| **Added** | `bulk_upload_db` added to Database Schema Overview | 02-detailed-microservices |
| **Added** | Inter-service communication rows for Gateway → Bulk Upload and Bulk Upload → Event Ingestion | 02-detailed-microservices |
| **Added** | `bulk-upload-service` row added to executive summary Microservices Overview table | 01-executive-summary |
| **Added** | Bulk Upload Service added to High-Level Architecture diagram | 03-system-architecture |
| **Added** | Bulk Upload :3008 added to Layer Architecture diagram (Compute layer) | 03-system-architecture |
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

*Notification API Documentation v1.3 -- Architecture Team -- 2026*
