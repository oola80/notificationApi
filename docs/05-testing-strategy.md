# 05 — Testing Strategy

**Notification API — Test Frameworks, E2E & Reporting**

| | |
|---|---|
| **Version:** | 1.0 |
| **Date:** | 2026-02-19 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Testing Strategy Overview](#1-testing-strategy-overview)
2. [Testing Pyramid & Coverage Goals](#2-testing-pyramid--coverage-goals)
3. [Unit Testing (Jest)](#3-unit-testing-jest)
4. [Frontend E2E (Playwright)](#4-frontend-e2e-playwright)
5. [Backend E2E Scaffolding](#5-backend-e2e-scaffolding)
6. [Allure Report](#6-allure-report)
7. [Test Directory Structure](#7-test-directory-structure)
8. [CI/CD Integration](#8-cicd-integration)
9. [Environment & Data Management](#9-environment--data-management)
10. [Quality Gates](#10-quality-gates)

---

## 1. Testing Strategy Overview

The Notification API testing strategy covers all layers of the application — from isolated unit tests through full system integration. The goal is to maintain high confidence in correctness, prevent regressions, and provide actionable visibility into test health through automated reporting.

| Layer | Framework | Scope | Execution |
|---|---|---|---|
| **Unit Tests** | Jest | Individual services, controllers, guards, pipes, interceptors, hooks, components | Every commit, pre-push, CI |
| **Frontend E2E** | Playwright | Admin UI critical user journeys across Chromium, Firefox, WebKit | Nightly, pre-deploy |
| **Backend E2E** | NestJS Testing + Docker Compose | Cross-service flows with real RabbitMQ, PostgreSQL, and mock providers | Merge to main, nightly |
| **Reporting** | Allure | Aggregated results from all test layers with history, trends, and failure categorization | Generated after every CI run |

> **Info:** **Key Principle:** Tests are first-class deliverables. Every service, feature, and user flow has an associated test suite. The testing infrastructure is designed, documented, and maintained with the same rigor as the application code itself.

---

## 2. Testing Pyramid & Coverage Goals

The testing strategy follows the classic testing pyramid: a broad base of fast unit tests, a smaller set of integration tests, and a focused layer of E2E tests covering critical paths.

```
                    Testing Pyramid

                       /\
                      /  \
                     / E2E \           Playwright (UI)
                    / Tests  \         + Backend E2E
                   /----------\
                  /            \
                 / Integration  \      NestJS Testing
                /    Tests       \     + Docker Compose
               /------------------\
              /                    \
             /    Unit Tests        \  Jest + ts-jest
            /       (Jest)           \
           /--------------------------\

Coverage Targets:
  NestJS: 80% line    Next.js: 70% line    E2E: Critical paths
```

| Target | Metric | Threshold |
|---|---|---|
| NestJS backend services | Line coverage | >= 80% |
| Next.js admin UI | Line coverage | >= 70% |
| Frontend E2E | Critical path coverage | 100% of defined journeys |
| Backend E2E | Cross-service flow coverage | All documented event-to-delivery flows |

---

## 3. Unit Testing (Jest)

### 3.1 NestJS Backend

Each NestJS microservice uses Jest with `ts-jest` and `@nestjs/testing` for unit tests. Tests are co-located with source files using the `*.spec.ts` convention.

#### Mocking Strategy

- **Service dependencies:** Mocked via `jest.fn()` and NestJS `Test.createTestingModule().overrideProvider()`
- **Database repositories:** Mocked with `jest.mock()` — no real database connections in unit tests
- **RabbitMQ:** Mocked using custom `MockAmqpConnection` that captures published messages for assertions
- **External HTTP calls:** Mocked with `jest.spyOn(httpService, 'get')` or interceptor-level mocks

#### Test Patterns by Component

| Component | Test Focus | Example Assertions |
|---|---|---|
| **Services** | Business logic, error handling, edge cases | Returns correct result, throws expected exceptions, calls dependencies with correct args |
| **Controllers** | Request/response mapping, validation, status codes | Returns 201 on create, 400 on invalid input, calls service with parsed body |
| **Guards** | Authentication and authorization logic | Allows valid JWT, rejects expired token, enforces role requirements |
| **Interceptors** | Response transformation, logging, error mapping | Wraps response in envelope, logs correlation ID, maps exceptions |
| **Pipes** | Input validation and transformation | Validates DTO shape, transforms strings to enums, rejects invalid payloads |

#### Jest Configuration (NestJS)

```typescript
// jest.config.ts (per-service)
export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['**/*.ts', '!**/*.module.ts', '!main.ts'],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: { lines: 80, branches: 70, functions: 80, statements: 80 }
  },
  testEnvironment: 'node',
  reporters: ['default', 'jest-allure2-reporter']
};
```

### 3.2 Next.js Frontend

The admin UI uses Jest with `@testing-library/react` and the `next/jest` preset for component and hook testing.

#### Test Scope

- **Components:** Render with mock props, verify DOM output, test user interactions (click, type, submit)
- **Hooks:** Test custom hooks with `@testing-library/react renderHook()`, verify state transitions
- **API client:** Mock `fetch` responses, verify request construction, test error handling
- **Utilities:** Pure function tests for formatters, validators, and transformers

#### Jest Configuration (Next.js)

```typescript
// jest.config.ts (notification-admin-ui)
import nextJest from 'next/jest';

const createJestConfig = nextJest({ dir: './' });

export default createJestConfig({
  testEnvironment: 'jsdom',
  setupFilesAfterSetup: ['<rootDir>/jest.setup.ts'],
  testRegex: '.*\\.spec\\.tsx?$',
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/layout.tsx'
  ],
  coverageThreshold: {
    global: { lines: 70, branches: 60, functions: 70, statements: 70 }
  },
  reporters: ['default', 'jest-allure2-reporter']
});
```

---

## 4. Frontend E2E (Playwright)

Playwright tests validate critical user journeys in the Admin UI across Chromium, Firefox, and WebKit. Tests run against a fully deployed local environment (Docker Compose) to ensure real API interactions.

### 4.1 Critical User Journeys

| Journey | Steps | Assertions |
|---|---|---|
| **Authentication** | Login with email/password, view dashboard, logout | JWT issued, dashboard loads, session cleared on logout |
| **Template CRUD** | Create template, edit body, preview, set active, delete | Template appears in list, preview renders variables, version history updates |
| **Rule Configuration** | Create rule, select event type, assign template, enable channels, activate | Rule appears in list, trigger count increments when test event fires |
| **Channel Management** | View channels, update SendGrid config, test connection | Config saved, test send succeeds, health indicator updates |
| **Notification Logs** | Search by date range, filter by channel, expand detail, view lifecycle | Results filtered correctly, lifecycle timeline shows all status transitions |
| **Dashboard** | Load dashboard, verify charts render, check metric values | Charts visible, metrics match expected test data, no console errors |

### 4.2 Page Object Model

Tests use the Page Object Model (POM) pattern to encapsulate page-specific selectors and actions, improving maintainability and readability.

```typescript
// e2e/pages/login.page.ts
export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.fill('[data-testid="email"]', email);
    await this.page.fill('[data-testid="password"]', password);
    await this.page.click('[data-testid="login-button"]');
  }

  async expectDashboard() {
    await expect(this.page).toHaveURL('/dashboard');
  }
}
```

### 4.3 Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  workers: 2,
  reporter: [
    ['html', { open: 'never' }],
    ['allure-playwright']
  ],
  use: {
    baseURL: 'http://localhost:3010',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
```

---

## 5. Backend E2E Scaffolding

Backend E2E tests validate cross-service flows using a Docker Compose test environment with real infrastructure (PostgreSQL, RabbitMQ) and mock external providers.

### 5.1 Test Environment

A dedicated `docker-compose.test.yml` provisions the complete test stack:

| Container | Purpose |
|---|---|
| All 8 backend services | Running with `NODE_ENV=test` and `MOCK_PROVIDERS=true` |
| PostgreSQL (test) | Isolated test databases, seeded per test suite |
| RabbitMQ (test) | Dedicated test instance with fresh queues |
| Mock Provider Server | Lightweight HTTP server simulating SendGrid, Twilio, and FCM APIs |

### 5.2 Test Scenarios

| Scenario | Flow | Validates |
|---|---|---|
| **Order -> Email** | Publish `order.placed` event -> Engine processes -> Template renders -> Channel Router delivers via mock SendGrid | Full event-to-delivery pipeline, template variable substitution, audit trail creation |
| **Invalid API Key** | Submit webhook with invalid API key -> Gateway rejects | Authentication enforcement, proper error response, no downstream processing |
| **Retry -> DLQ** | Mock provider returns 500 -> Channel Router retries with backoff -> Exceeds max retries -> Message lands in DLQ | Retry logic, exponential backoff timing, DLQ routing, failure status in audit |
| **Template Rendering** | Create template via API -> Create rule -> Publish event -> Verify rendered output matches expected content | Handlebars variable substitution, multi-channel variants, template versioning |
| **RBAC Enforcement** | Authenticate as Viewer -> Attempt to create a rule -> Expect 403 | Role-based access control at gateway level, permission checking |
| **Email Ingest** | Send SMTP email to Email Ingest Service -> Parse against rules -> Generate event -> Verify downstream processing | SMTP reception, email parsing, event generation, integration with ingestion pipeline |

### 5.3 Test Utilities

| Utility | Purpose |
|---|---|
| `TestRabbitMQHelper` | Publish messages, consume from queues, assert message content, flush queues between tests |
| `TestDatabaseSeeder` | Seed test data (users, templates, rules, channels) via builder pattern, clean up between suites |
| `MockProviderServer` | Express-based mock server recording requests from Channel Router. Configurable responses (200, 500, timeout). Assertions on request count, payload content, and headers |

---

## 6. Allure Report

Allure serves as the unified test reporting layer, aggregating results from Jest unit tests, Playwright E2E tests, and backend E2E tests into a single, browsable HTML report.

### 6.1 Reporter Adapters

| Test Layer | Adapter | npm Package |
|---|---|---|
| Jest (NestJS + Next.js) | jest-allure2-reporter | `jest-allure2-reporter` |
| Playwright | allure-playwright | `allure-playwright` |

### 6.2 Features

- **History Trends:** Track pass/fail rates over time. Identify flaky tests and regression patterns.
- **Failure Categorization:** Automatic categorization of failures (product defect, test defect, infrastructure issue) based on configurable patterns.
- **Step Breakdowns:** Playwright tests include step-by-step action breakdowns with screenshots on failure. Jest tests include assertion details.
- **Attachments:** Screenshots (Playwright failures), API response bodies (backend E2E), log output, and test data snapshots.
- **Environment Metadata:** Captures Node.js version, Docker image tags, service versions, and test configuration for reproducibility.

### 6.3 Generation Commands

```bash
# Generate Allure results from all test layers
npm run test:unit -- --reporter=jest-allure2-reporter
npx playwright test --reporter=allure-playwright

# Merge results from all layers
allure generate ./allure-results-unit ./allure-results-e2e ./allure-results-playwright -o ./allure-report --clean

# Open the report
allure open ./allure-report
```

---

## 7. Test Directory Structure

```
notification-api/
├── services/
│   ├── notification-gateway/
│   │   └── src/
│   │       ├── auth/
│   │       │   ├── auth.guard.ts
│   │       │   └── auth.guard.spec.ts          # Unit test (co-located)
│   │       └── .../*.spec.ts
│   ├── event-ingestion-service/
│   │   └── src/**/*.spec.ts                     # Unit tests
│   ├── notification-engine-service/
│   │   └── src/**/*.spec.ts
│   ├── template-service/
│   │   └── src/**/*.spec.ts
│   ├── channel-router-service/
│   │   └── src/**/*.spec.ts
│   ├── admin-service/
│   │   └── src/**/*.spec.ts
│   ├── audit-service/
│   │   └── src/**/*.spec.ts
│   └── email-ingest-service/
│       └── src/**/*.spec.ts
├── notification-admin-ui/
│   ├── src/**/*.spec.tsx                         # Component unit tests
│   └── e2e/                                      # Playwright tests
│       ├── pages/                                # Page Object Models
│       │   ├── login.page.ts
│       │   ├── dashboard.page.ts
│       │   ├── templates.page.ts
│       │   └── rules.page.ts
│       ├── fixtures/                             # Test data & helpers
│       ├── auth.spec.ts                          # Auth journey
│       ├── templates.spec.ts                     # Template CRUD journey
│       ├── rules.spec.ts                         # Rule config journey
│       ├── channels.spec.ts                      # Channel mgmt journey
│       ├── logs.spec.ts                          # Log search journey
│       └── dashboard.spec.ts                     # Dashboard journey
├── test/
│   └── e2e/                                      # Cross-service backend E2E
│       ├── docker-compose.test.yml
│       ├── utils/
│       │   ├── test-rabbitmq-helper.ts
│       │   ├── test-database-seeder.ts
│       │   └── mock-provider-server.ts
│       ├── scenarios/
│       │   ├── order-to-email.e2e.ts
│       │   ├── retry-and-dlq.e2e.ts
│       │   ├── template-rendering.e2e.ts
│       │   ├── rbac-enforcement.e2e.ts
│       │   └── email-ingest.e2e.ts
│       └── jest.e2e.config.ts
└── allure-results/                               # Aggregated Allure output
```

---

## 8. CI/CD Integration

Tests are integrated into the CI/CD pipeline at multiple stages, with different test suites running at different gates based on their execution time and scope.

| Stage | Trigger | Tests Run | Max Duration |
|---|---|---|---|
| **Pre-commit** | Git hook (lint-staged) | Affected unit tests only (Jest `--changedSince`) | 30 seconds |
| **PR Build** | Pull request opened/updated | All unit tests + lint + type check | 5 minutes |
| **Merge to Main** | PR merged | All unit tests + backend E2E | 15 minutes |
| **Nightly** | Scheduled (02:00 UTC) | All unit + backend E2E + Playwright E2E (all browsers) | 45 minutes |
| **Pre-deploy** | Deployment pipeline | Smoke subset: critical path unit + backend E2E (order->email) | 10 minutes |

> **Note:** **Allure in CI:** Every CI run publishes Allure results as a build artifact. The nightly run additionally deploys the Allure report to a static hosting location for team access. Historical trend data is preserved across runs by persisting the Allure history directory.

---

## 9. Environment & Data Management

### 9.1 Test Database Management

- **Isolation:** Each test suite gets its own database schema or uses transaction rollback to ensure test independence.
- **Seeding:** Test data is created via the `TestDatabaseSeeder` utility, which uses a builder pattern for readable test setup.
- **Cleanup:** Databases are truncated between test suites (not between individual tests — too slow). Within a suite, tests use transactions that are rolled back.

### 9.2 Data Factories

Data factories follow the builder pattern for creating test entities:

```typescript
// Example: Creating test data with the builder pattern
const template = await TestDatabaseSeeder.template()
  .withName('Order Confirmation')
  .withChannel('email')
  .withBody('Hello {{customerName}}, your order #{{orderId}} is confirmed.')
  .withVariables(['customerName', 'orderId'])
  .create();

const rule = await TestDatabaseSeeder.rule()
  .forEventType('order.placed')
  .withTemplate(template.id)
  .onChannels(['email', 'sms'])
  .enabled()
  .create();
```

### 9.3 Mock Providers

When `MOCK_PROVIDERS=true` is set, the Channel Router connects to the `MockProviderServer` instead of real external APIs. The mock server:

- Records all incoming requests for assertion in tests
- Returns configurable responses (success, failure, timeout) per endpoint
- Simulates provider-specific response formats (SendGrid, Twilio, FCM)
- Supports webhook callback simulation for delivery receipts

### 9.4 Isolation Requirements

| Requirement | Implementation |
|---|---|
| No shared state between test suites | Database truncation + queue flush between suites |
| No dependency on execution order | Each test creates its own required data via factories |
| No external network calls | `MOCK_PROVIDERS=true` routes all provider calls to local mock |
| Deterministic time | Tests that depend on time use `jest.useFakeTimers()` or injectable clock |

---

## 10. Quality Gates

Quality gates enforce minimum standards at each stage of the delivery pipeline. A failed quality gate blocks progression (merge, deploy) until resolved.

| Gate | Metric | Threshold | Blocks |
|---|---|---|---|
| **Unit Test Pass Rate** | % of tests passing | 100% | PR merge |
| **NestJS Coverage** | Line coverage | >= 80% | PR merge |
| **Next.js Coverage** | Line coverage | >= 70% | PR merge |
| **Backend E2E Pass Rate** | % of scenarios passing | 100% | Merge to main |
| **Playwright E2E Pass Rate** | % of journeys passing | 100% (with 1 retry) | Deploy |
| **Allure Report** | Report generation | Must generate without errors | Deploy |
| **No New Lint Errors** | ESLint violations | 0 new errors (warnings allowed) | PR merge |
| **Type Check** | TypeScript compilation | 0 errors | PR merge |

> **Success:** **Enforcement:** Quality gates are enforced by CI pipeline configuration. PRs cannot be merged if unit tests fail or coverage drops below thresholds. Deployments are blocked if E2E tests fail or the Allure report does not generate. These gates are non-negotiable — no manual overrides are permitted without explicit Architecture Team approval.

---

*Notification API Documentation v1.0 -- Architecture Team -- 2026*
