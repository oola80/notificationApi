# Notification API

**Unified Notification Platform — Documentation Hub**

| | |
|---|---|
| **Version:** | 1.0 |
| **Date:** | 2026-02-19 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Project Overview

The Notification API is a unified event-driven platform designed to consolidate the fragmented notification landscape across our eCommerce ecosystem. Today, customer-facing notifications originate independently from OMS, Magento 2, the Mirakl Marketplace, Chat Commerce workflows, closed/legacy systems, and various manual processes — each with its own delivery logic, templates, and provider integrations. This platform replaces that patchwork with a single, centralized microservices system capable of ingesting events from all source systems — including closed/legacy systems via email ingestion — and orchestrating multi-channel delivery across Email, WhatsApp, SMS, and Push Notifications. The result is a consistent customer communication experience, a self-service backoffice for the operative team, centralized template management with versioning, and a complete audit trail for every notification sent.

> **Info:** **Architecture Highlights**
>
> Event-driven microservices architecture built with NestJS, Next.js, RabbitMQ, and PostgreSQL. Supports Email, WhatsApp, SMS, and Push Notification channels with extensible provider integrations. Each microservice owns its own database, communicates asynchronously through RabbitMQ exchanges, and is independently deployable via Docker containers. The system is designed for horizontal scalability, provider failover, and zero-downtime deployments.

---

## Key Capabilities

The platform delivers six core capabilities that together provide end-to-end notification lifecycle management — from event ingestion through delivery, tracking, and analytics.

### Unified Event Ingestion

Consolidates events from OMS, Magento 2, Mirakl Marketplace, Chat Commerce, and closed/legacy systems into a standardized event schema. Source systems publish events via REST API or RabbitMQ, while closed/legacy systems that can only send email are integrated through a dedicated Email Ingest Service that parses incoming emails and generates standardized events. The ingestion layer normalizes, validates, and routes all events downstream.

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

---

*Notification API Documentation v1.0 -- Architecture Team -- 2026*
