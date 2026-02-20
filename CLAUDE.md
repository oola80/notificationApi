# Notification API

Unified notification platform for eCommerce — consolidates fragmented notifications from OMS, Magento 2, Mirakl Marketplace, Chat Commerce, and manual processes into a single event-driven microservices system.

## Project Status

Design documentation phase. No application code yet — only architecture docs.

## Tech Stack (Planned)

- **Backend:** NestJS (TypeScript) microservices
- **Frontend:** Next.js (Admin backoffice)
- **Message Broker:** RabbitMQ (AMQP, topic exchanges, dead-letter queues)
- **Database:** PostgreSQL (database-per-service pattern)
- **Containerization:** Docker / Docker Compose
- **Notification Providers:** SendGrid (email), Twilio (SMS/WhatsApp), Firebase Cloud Messaging (push)

## Microservices

| Service | Port | Purpose |
|---|---|---|
| notification-gateway | 3000 | BFF / API Gateway (auth, routing, rate limiting) |
| event-ingestion-service | 3001 | Receives and normalizes events from source systems |
| notification-engine-service | 3002 | Core orchestrator — rules, recipients, lifecycle |
| template-service | 3003 | Template CRUD, Handlebars rendering, versioning |
| channel-router-service | 3004 | Routes to delivery providers, retry/circuit breaker |
| admin-service | 3005 | Backoffice administration |
| audit-service | 3006 | Notification tracking, delivery receipts, analytics |
| email-ingest-service | 3007/2525 | SMTP ingest — receives emails, parses, generates events |
| bulk-upload-service | 3008 | XLSX bulk upload — parses spreadsheets, submits events |
| notification-admin-ui | 3010 | Next.js admin frontend |

## Documentation

All design docs live in `docs/`. Each document exists in both HTML (styled, with SVG diagrams) and Markdown formats.

```
docs/
  css/styles.css                    # Shared stylesheet (521 lines, all design tokens)
  index.html / index.md             # Documentation hub page
  01-executive-summary.html / .md   # Project overview, problem, solution, scope
  02-detailed-microservices.html / .md  # Service specs, APIs, schemas, RabbitMQ config
  03-system-architecture.html / .md # Architecture diagrams, layers, flows, security
  04-authentication-identity.html / .md  # Auth flows, SAML SSO, JWT sessions, account linking
  05-testing-strategy.html / .md    # Jest, Playwright, Allure reporting, CI/CD gates
  06-changelog.html / .md           # Documentation & feature change log
```

### HTML docs

- Standalone — no JS, no build step, open directly in browser
- Single shared `css/styles.css` with Confluence-like styling
- Inline SVG diagrams (high-level architecture, layer diagram, event flow, ER diagram, state machine)
- Components: callout boxes, API endpoint blocks, status badges, feature cards, tables

### Markdown docs

- Equivalent content to HTML counterparts
- SVG diagrams replaced with ASCII art
- Callout boxes use blockquote syntax (`> **Info:** ...`)

## Conventions

- Documentation filenames: `NN-kebab-case-name.html` / `.md` (numbered, lowercase)
- CSS color palette primary: #0052CC, text: #172B4D, success: #00875A, warning: #FF991F, error: #FF5630
- All HTML docs include nav bar with active page highlighted; index.html has no nav
- Tables use blue headers (#0052CC bg, white text)
- Every documentation or feature change must include a corresponding entry in `docs/06-changelog.html` and `docs/06-changelog.md`
