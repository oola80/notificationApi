# 15 — Notification Admin UI

**Notification API — Admin Frontend Deep-Dive**

| | |
|---|---|
| **Version:** | 2.0 |
| **Date:** | 2026-02-28 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Architecture & Integration Points](#2-architecture--integration-points)
3. [Technology Stack & Libraries](#3-technology-stack--libraries)
4. [Application Structure](#4-application-structure)
5. [Authentication & Session Management](#5-authentication--session-management)
6. [Data Fetching & State Management](#6-data-fetching--state-management)
7. [Page Specifications](#7-page-specifications)
8. [Component Architecture](#8-component-architecture)
9. [API Integration Layer](#9-api-integration-layer)
10. [Routing & Navigation](#10-routing--navigation)
11. [Flowcharts](#11-flowcharts)
12. [Sequence Diagrams](#12-sequence-diagrams)
13. [Entity Relationship: UI Data Model](#13-entity-relationship-ui-data-model)
14. [Error Handling & User Feedback](#14-error-handling--user-feedback)
15. [Accessibility & Responsive Design](#15-accessibility--responsive-design)
16. [Testing Strategy](#16-testing-strategy)
17. [Security Considerations](#17-security-considerations)
18. [Monitoring & Observability](#18-monitoring--observability)
19. [Configuration & Environment Variables](#19-configuration--environment-variables)
20. [Deployment](#20-deployment)

---

## 1. Service Overview

The Notification Admin UI is the self-service Next.js backoffice application that enables the operative team to configure, manage, and monitor every aspect of the Notification API platform. It is an independent frontend application with no authentication — all pages are public and all features are available to any user who can reach the application.

| Attribute | Value |
|---|---|
| **Technology** | Next.js 14 (App Router) with TypeScript |
| **Port** | `3159` |
| **Database** | None — all data through API |
| **Dependencies** | 7 backend microservices (direct communication) |
| **Authentication** | None (deferred) |
| **Source Repo Folder** | `notification-admin-ui/` |

### Responsibilities

1. **Dashboard & Analytics:** Real-time notification volume charts, delivery success rates, channel breakdowns, failure analysis, top triggered rules, and system health indicators — with graceful degradation for partial data. Data sourced from audit-service (:3156).
2. **Notification Rule Management:** List, create, edit, and delete notification rules with a visual condition builder, template picker, channel selector, recipient configuration, suppression settings, and delivery priority override. Data sourced from notification-engine-service (:3152).
3. **Template Management:** WYSIWYG editor for HTML email templates, plain text editors for SMS and WhatsApp, push notification previewer. Live preview with variable interpolation, version history, and rollback. Data sourced from template-service (:3153).
4. **Channel Configuration:** Channel health cards, provider configuration forms (Mailgun, Braze, WhatsApp/Meta, AWS SES), connection testing, and credential rotation workflows. Data sourced from channel-router-service (:3154).
5. **Event Mapping Management:** Visual mapping builder for runtime field mapping configurations. Mapping test panel with sample payload input and normalized output preview. Priority configuration. Data sourced from event-ingestion-service (:3151).
6. **Notification Logs & Tracing:** Searchable, filterable log table with expandable detail rows. Full notification lifecycle timeline, rendered content preview, and delivery attempt history. Data sourced from audit-service (:3156).
7. **Bulk Upload:** Drag-and-drop XLSX upload, real-time processing progress, upload history, error detail panel with export, and sample template download. Data sourced from bulk-upload-service (:3158).
8. **System Configuration:** Global platform settings management (retention, feature flags, rate limits). Data sourced from admin-service (:3155).
9. **Recipient Group Management:** Create and manage static and dynamic recipient groups for use in notification rules. Data sourced from notification-engine-service (:3152).

> **Info:** **Direct Microservice Communication**
>
> The Notification Admin UI communicates **directly with each backend microservice** that owns the data it needs. There is no BFF proxy, no gateway, and no single aggregation service between the UI and the backends. Each page talks to the specific microservice responsible for its domain. This keeps the architecture simple and eliminates proxy latency. A reverse proxy or API gateway can be added at the infrastructure level later if needed for cross-cutting concerns (rate limiting, CORS, TLS termination) without changing the UI code — only the environment variables would change.

---

## 2. Architecture & Integration Points

The Admin UI sits in the Edge Layer of the platform architecture. It is a pure presentation-tier application with no backend state — every piece of data is fetched from and persisted through the backend microservice APIs directly.

### Figure 2.1 — Integration Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Notification Admin UI :3159                             │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        Next.js App Router                              │ │
│  │                                                                        │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │ │
│  │  │Dashboard │ │Rules     │ │Templates │ │Channels  │ │Notification│ │ │
│  │  │Page      │ │Page      │ │Page      │ │Page      │ │Logs Page   │ │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────────┘ │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐           │ │
│  │  │Event     │ │Bulk      │ │Recipient │ │System        │           │ │
│  │  │Mappings  │ │Upload    │ │Groups    │ │Settings Page │           │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘           │ │
│  │                                                                        │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │ │
│  │  │               Multi-Service API Integration Layer                │ │ │
│  │  │  apiClient (fetch wrapper) · SWR hooks · per-service routing    │ │ │
│  │  └───┬──────────┬──────────┬──────────┬──────────┬─────────────────┘ │ │
│  └──────┼──────────┼──────────┼──────────┼──────────┼───────────────────┘ │
└─────────┼──────────┼──────────┼──────────┼──────────┼─────────────────────┘
          │          │          │          │          │
          ▼          ▼          ▼          ▼          ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
    │Event     │ │Notif     │ │Template  │ │Channel   │ │Audit     │
    │Ingestion │ │Engine    │ │Service   │ │Router    │ │Service   │
    │:3151     │ │:3152     │ │:3153     │ │:3154     │ │:3156     │
    └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
    ┌──────────┐ ┌──────────┐
    │Admin     │ │Bulk      │
    │Service   │ │Upload    │
    │:3155     │ │:3158     │
    └──────────┘ └──────────┘
```

### Service Routing Map

Each UI feature area routes to the microservice that owns the domain:

| UI Feature Area | Target Service | Port | API Base Path |
|---|---|---|---|
| **Event Mappings** | event-ingestion-service | 3151 | `/api/v1/event-mappings` |
| **Notification Rules** | notification-engine-service | 3152 | `/api/v1/rules` |
| **Recipient Groups** | notification-engine-service | 3152 | `/api/v1/recipient-groups` |
| **Templates** | template-service | 3153 | `/api/v1/templates` |
| **Channels & Providers** | channel-router-service | 3154 | `/api/v1/channels`, `/api/v1/providers` |
| **System Configuration** | admin-service | 3155 | `/api/v1/system-configs` |
| **Dashboard Analytics** | audit-service | 3156 | `/api/v1/analytics/summary` |
| **Notification Logs** | audit-service | 3156 | `/api/v1/logs` |
| **Audit Log Viewer** | audit-service | 3156 | `/api/v1/logs` |
| **Notification Tracing** | audit-service | 3156 | `/api/v1/trace` |
| **Bulk Upload** | bulk-upload-service | 3158 | `/api/v1/uploads` |

### Communication Pattern

| Direction | Target | Protocol | Description |
|---|---|---|---|
| **Outbound** | event-ingestion-service :3151 | HTTP (REST) | Event mapping CRUD, mapping test |
| **Outbound** | notification-engine-service :3152 | HTTP (REST) | Rules CRUD, recipient groups CRUD |
| **Outbound** | template-service :3153 | HTTP (REST) | Template CRUD, rendering, preview |
| **Outbound** | channel-router-service :3154 | HTTP (REST) | Channel list, provider config |
| **Outbound** | admin-service :3155 | HTTP (REST) | System configuration |
| **Outbound** | audit-service :3156 | HTTP (REST) | Dashboard analytics, logs, search, trace, receipts |
| **Outbound** | bulk-upload-service :3158 | HTTP (REST) | Upload CRUD, file upload, result download |
| **Inbound** | User's browser | HTTP | Serves SSR pages and static assets |

---

## 3. Technology Stack & Libraries

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 14.x | React framework with App Router, SSR, server components, API routes |
| **React** | 18.x | UI component library |
| **TypeScript** | 5.x | Type-safe development across all components and API types |
| **TipTap / ProseMirror** | Latest | WYSIWYG rich text editor for HTML email templates |
| **SWR** | 2.x | Data fetching with caching, revalidation, and optimistic updates |
| **Tailwind CSS** | 3.x | Utility-first CSS framework for responsive, consistent styling |
| **Radix UI** | Latest | Accessible, unstyled primitive components (dialogs, dropdowns, tooltips, tabs) |
| **React Hook Form** | 7.x | Performant form handling with Zod schema validation |
| **Zod** | 3.x | Runtime schema validation for form inputs and API response typing |
| **Recharts** | 2.x | Charting library for dashboard visualizations (line, bar, pie, area) |
| **date-fns** | 3.x | Lightweight date formatting and manipulation |
| **Lucide React** | Latest | Icon set |
| **Sonner** | Latest | Toast notification system |
| **exceljs** | 4.x | Client-side XLSX template generation for bulk upload sample downloads |
| **Monaco Editor** | Latest | Code editor widget for JSON mapping payloads and template variable inspection |

### Build & Development Tools

| Tool | Purpose |
|---|---|
| **ESLint** | Code quality with Next.js and TypeScript rules |
| **Prettier** | Code formatting |
| **Jest** | Unit testing for hooks, utilities, and component logic |
| **Playwright** | End-to-end cross-browser testing |
| **Docker** | Container for production deployment |

---

## 4. Application Structure

The project follows the Next.js 14 App Router convention with feature-based folder organization.

```
notification-admin-ui/
├── src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── layout.tsx                # Root layout — sidebar, SWR provider (no auth)
│   │   ├── page.tsx                  # Redirect to /dashboard
│   │   ├── dashboard/
│   │   │   └── page.tsx              # Dashboard with metrics and charts
│   │   ├── rules/
│   │   │   ├── page.tsx              # Rule list
│   │   │   ├── new/
│   │   │   │   └── page.tsx          # Create rule
│   │   │   └── [id]/
│   │   │       ├── page.tsx          # Rule detail / edit
│   │   │       └── history/
│   │   │           └── page.tsx      # Rule change history
│   │   ├── templates/
│   │   │   ├── page.tsx              # Template list
│   │   │   ├── new/
│   │   │   │   └── page.tsx          # Create template
│   │   │   └── [id]/
│   │   │       ├── page.tsx          # Template editor
│   │   │       └── versions/
│   │   │           └── page.tsx      # Version history
│   │   ├── channels/
│   │   │   ├── page.tsx              # Channel list with health cards
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Channel configuration
│   │   ├── logs/
│   │   │   ├── page.tsx              # Notification log list
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Notification detail / trace
│   │   ├── event-mappings/
│   │   │   ├── page.tsx              # Mapping list
│   │   │   ├── new/
│   │   │   │   └── page.tsx          # Create mapping
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Mapping editor with test panel
│   │   ├── bulk-upload/
│   │   │   ├── page.tsx              # Upload zone and history
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Upload detail with error rows
│   │   ├── recipient-groups/
│   │   │   ├── page.tsx              # Group list
│   │   │   ├── new/
│   │   │   │   └── page.tsx          # Create group
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Group detail with members
│   │   ├── audit/
│   │   │   └── page.tsx              # Audit log viewer
│   │   └── settings/
│   │       └── page.tsx              # System configuration
│   ├── components/
│   │   ├── ui/                       # Primitive UI components (Button, Input, Table, etc.)
│   │   ├── layout/                   # Sidebar, Header, Breadcrumbs, PageContainer
│   │   ├── dashboard/                # MetricCard, VolumeChart, DeliveryRateGauge, etc.
│   │   ├── rules/                    # RuleForm, ConditionBuilder, ChannelSelector, etc.
│   │   ├── templates/                # TemplateEditor, ChannelTabPanel, VariableToolbar, etc.
│   │   ├── channels/                 # ChannelCard, ProviderConfigForm, ConnectionTestButton
│   │   ├── logs/                     # LogTable, NotificationTimeline, ContentPreview
│   │   ├── mappings/                 # MappingBuilder, FieldMappingRow, MappingTestPanel
│   │   ├── bulk-upload/              # UploadDropzone, ProgressBar, ErrorTable
│   │   ├── recipient-groups/         # GroupForm, MemberList, CriteriaBuilder
│   │   └── shared/                   # Pagination, StatusBadge, ConfirmDialog, EmptyState
│   ├── hooks/                        # Custom React hooks
│   │   ├── useDashboard.ts           # Dashboard data fetching
│   │   ├── useRules.ts               # Rule CRUD operations
│   │   ├── useTemplates.ts           # Template CRUD operations
│   │   ├── useChannels.ts            # Channel config operations
│   │   ├── useMappings.ts            # Event mapping operations
│   │   ├── useNotifications.ts       # Notification log queries
│   │   ├── useBulkUpload.ts          # Upload lifecycle management
│   │   ├── useRecipientGroups.ts     # Recipient group operations
│   │   ├── useAuditLogs.ts           # Audit log queries
│   │   └── useToast.ts               # Toast notification helper
│   ├── lib/
│   │   ├── api-client.ts             # Multi-service fetch wrapper (no auth)
│   │   ├── service-config.ts         # Service URL registry from env vars
│   │   ├── validators.ts             # Zod schemas for form validation
│   │   └── formatters.ts             # Date, number, and status formatting utilities
│   ├── types/
│   │   ├── api.ts                    # API response envelope types
│   │   ├── rules.ts                  # Rule, condition, action types
│   │   ├── templates.ts              # Template, version, channel content types
│   │   ├── channels.ts               # Channel, provider config types
│   │   ├── mappings.ts               # Event mapping, field mapping types
│   │   ├── notifications.ts          # Notification, status log, trace types
│   │   ├── uploads.ts                # Upload, upload row types
│   │   └── dashboard.ts              # Dashboard metric types
│   └── styles/
│       └── globals.css               # Tailwind imports and global styles
├── public/
│   └── ...                           # Static assets (favicon, logo, etc.)
├── next.config.js                    # Next.js configuration
├── tailwind.config.ts                # Tailwind CSS configuration
├── tsconfig.json                     # TypeScript configuration
├── jest.config.ts                    # Jest configuration
├── playwright.config.ts              # Playwright E2E configuration
├── Dockerfile                        # Production container
└── .env.local                        # Local environment variables
```

---

## 5. Authentication & Session Management

Authentication is **deferred** in this version of the Notification Admin UI. The application is open access — all pages and features are available without login. There is no JWT token management, no session state, and no RBAC enforcement.

### Why Deferred

- The auth-rbac-service ecosystem (backend :3160, frontend :3161, ecommerce-backoffice :3162) is designed but not yet implemented (see [18 — Auth/RBAC Architecture Addendum](18-auth-rbac-architecture-addendum.md)).
- Implementing auth in the Admin UI before the auth services exist would create a circular dependency.
- For the initial development and testing phase, an unauthenticated UI accelerates iteration.

### Future Integration Path

When authentication is added later, the integration follows the pattern defined in [18 — Auth/RBAC Architecture Addendum §8](18-auth-rbac-architecture-addendum.md#8-auth-token-flow):

1. User authenticates via ecommerce-backoffice (:3162).
2. ecommerce-backoffice requests an app-scoped JWT for the notification-admin-ui application.
3. ecommerce-backoffice redirects to `notification-admin-ui?token={appToken}`.
4. The Admin UI stores the app-scoped JWT and attaches it to all API requests via an `Authorization: Bearer {token}` interceptor.
5. Each backend microservice validates the JWT locally using the RS256 public key.

This future integration will require:
- Adding `SessionProvider`, `AuthGuard`, and `RBACProvider` wrapper components.
- Adding an authentication interceptor to the API client.
- Adding JWT validation guards to each backend microservice (currently only admin-service has this planned).
- Adding conditional UI rendering based on user roles and permissions (RBAC enforcement).
- Re-adding login/password pages if the UI should handle auth flows itself, or relying on ecommerce-backoffice redirect.

---

## 6. Data Fetching & State Management

### 6.1 SWR (stale-while-revalidate) Strategy

All read operations use SWR hooks for efficient data fetching with built-in caching, background revalidation, and error retry.

| Feature | Configuration |
|---|---|
| **Cache provider** | In-memory (default SWR cache) |
| **Revalidate on focus** | Enabled — refetches when user returns to tab |
| **Revalidate on reconnect** | Enabled — refetches after network recovery |
| **Deduplication interval** | 2 seconds — prevents duplicate requests within window |
| **Error retry** | 3 attempts with exponential backoff (1s, 3s, 5s) |
| **Polling intervals** | Configurable per resource (dashboard: 30s, bulk upload status: 5s) |

### 6.2 Data Flow Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      React Components                              │
│                                                                    │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                      │
│  │ Page     │   │ Page     │   │ Page     │                      │
│  │ Component│   │ Component│   │ Component│                      │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘                      │
│       │              │              │                             │
│       ▼              ▼              ▼                             │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                   Custom SWR Hooks                            ││
│  │  useRules() · useTemplates() · useDashboard()                ││
│  │  useChannels() · useMappings() · useNotifications()          ││
│  └────────────────────────┬─────────────────────────────────────┘│
│                            │                                      │
│                            ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                    SWR Cache Layer                             ││
│  │  In-memory cache · Deduplication · Revalidation               ││
│  └────────────────────────┬─────────────────────────────────────┘│
│                            │                                      │
│                            ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │            Multi-Service API Client (fetch wrapper)           ││
│  │  Service routing · Error handling · Response parsing          ││
│  │  No auth interceptor                                          ││
│  └───┬─────────┬─────────┬─────────┬─────────┬─────────┬───────┘│
└──────┼─────────┼─────────┼─────────┼─────────┼─────────┼────────┘
       │ HTTP    │ HTTP    │ HTTP    │ HTTP    │ HTTP    │ HTTP
       ▼         ▼         ▼         ▼         ▼         ▼
     :3151     :3152     :3153     :3154     :3155/:3156  :3158
```

### 6.3 Mutation Pattern

Write operations (create, update, delete) use a consistent mutation pattern:

1. **Optimistic update** (optional): Update the SWR cache immediately for responsive UX.
2. **API call**: Send the mutation request to the target microservice.
3. **Revalidation**: On success, mutate the SWR cache to trigger revalidation of affected keys.
4. **Rollback**: On failure, revert the optimistic update and show an error toast.

### 6.4 Server Components vs. Client Components

| Component Type | Used For | Data Fetching |
|---|---|---|
| **Server Components** | Page shells, layout, metadata, initial data prefetch | `fetch()` during SSR |
| **Client Components** | Interactive elements (forms, charts, editors, modals) | SWR hooks for client-side fetching and revalidation |

> **Info:** **SSR Data Prefetch**
>
> Server components in the Next.js App Router fetch initial data during SSR directly from the backend microservices. This data is serialized into the page HTML as a SWR `fallback`, allowing the client-side SWR hooks to hydrate instantly without a loading state on first paint. Subsequent interactions use client-side SWR for real-time updates.

---

## 7. Page Specifications

### 7.1 Dashboard (`/dashboard`)

The dashboard provides at-a-glance operational visibility across the entire notification platform.

#### Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  Total Sent  │  │  Delivery   │  │  Failures   │  │  Pending    │ │
│  │  Today       │  │  Rate       │  │  (24h)      │  │  Queue Depth│ │
│  │  ┌───────┐   │  │  ┌───────┐  │  │  ┌───────┐  │  │  ┌───────┐  │ │
│  │  │ 1,234 │   │  │  │ 97.2% │  │  │  │   18  │  │  │  │  42   │  │ │
│  │  └───────┘   │  │  └───────┘  │  │  └───────┘  │  │  └───────┘  │ │
│  │  +12% vs 7d  │  │  -0.3% 7d  │  │  -5 vs 7d   │  │  normal     │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────┐  ┌────────────────────────┐  │
│  │  Notification Volume (Line Chart)  │  │  Channel Breakdown     │  │
│  │                                    │  │  (Pie Chart)           │  │
│  │  [Today] [7d] [30d] [90d]         │  │                        │  │
│  │    ╱╲                              │  │   Email: 68%           │  │
│  │   ╱  ╲    ╱╲                       │  │   SMS: 18%             │  │
│  │  ╱    ╲  ╱  ╲                      │  │   Push: 10%            │  │
│  │ ╱      ╲╱    ╲                     │  │   WhatsApp: 4%         │  │
│  └────────────────────────────────────┘  └────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────┐  ┌────────────────────────┐  │
│  │  Delivery Rates by Channel         │  │  Channel Health        │  │
│  │  (Bar Chart — stacked)             │  │                        │  │
│  │                                    │  │  Email    [Mailgun]    │  │
│  │  Email    █████████░ 98%           │  │  ● Healthy             │  │
│  │  SMS      ████████░░ 95%           │  │                        │  │
│  │  WhatsApp ████████░░ 97%           │  │  SMS      [Braze]      │  │
│  │  Push     ███████░░░ 92%           │  │  ● Healthy             │  │
│  │                                    │  │                        │  │
│  └────────────────────────────────────┘  │  WhatsApp [Meta]       │  │
│                                          │  ● Healthy             │  │
│  ┌────────────────────────────────────┐  │                        │  │
│  │  Top Triggered Rules (7 days)      │  │  Push     [Braze]      │  │
│  │                                    │  │  ● Healthy             │  │
│  │  1. Order Shipped — Email+SMS  521 │  └────────────────────────┘  │
│  │  2. Payment Confirmed — Email  410 │                              │
│  │  3. Return Processed — Email   198 │  ┌────────────────────────┐  │
│  │  4. Delivery Delay — SMS+Push   87 │  │  Recent Failures       │  │
│  │  5. Welcome Email — Email       65 │  │                        │  │
│  └────────────────────────────────────┘  │  ● 10:32 SMS timeout.. │  │
│                                          │  ● 10:28 Push invalid..│  │
│                                          │  ● 10:15 Email bounce..│  │
│                                          └────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

#### Data Sources

| Widget | Service Endpoint | Refresh |
|---|---|---|
| Metric cards | audit-service `GET /api/v1/analytics/summary` | 30s polling |
| Notification volume chart | audit-service `GET /api/v1/analytics/summary` | 30s polling |
| Channel breakdown | audit-service `GET /api/v1/analytics/summary` | 30s polling |
| Delivery rates by channel | audit-service `GET /api/v1/analytics/summary` | 30s polling |
| Channel health | channel-router-service `GET /api/v1/channels` | 60s polling |
| Top triggered rules | audit-service `GET /api/v1/analytics/summary` | 60s polling |
| Recent failures | audit-service `GET /api/v1/analytics/summary` | 30s polling |

#### Graceful Degradation

When any backend service is unreachable, the UI renders available widgets normally and replaces unavailable sections with a warning banner:

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠  Some metrics are temporarily unavailable.                │
│     Affected: Channel health (channel-router-service)        │
│     Last updated: 10:28 AM                                   │
└──────────────────────────────────────────────────────────────┘
```

---

### 7.2 Notification Rule Management (`/rules`)

#### Rule List Page

| Feature | Description |
|---|---|
| **Table columns** | Name, Event Type, Priority, Channels, Template, Suppression (icon), Status (toggle), Trigger Count (7d), Created, Actions |
| **Filters** | Event type (dropdown), Channel (multi-select), Status (active/inactive), Search (name) |
| **Sorting** | Name, Event Type, Priority, Created Date (default: descending) |
| **Pagination** | Server-side, 50 per page |
| **Actions** | Edit, Duplicate, Delete (with confirmation), Toggle active/inactive |

#### Rule Create / Edit Form

```
┌──────────────────────────────────────────────────────────────────────┐
│  Create Notification Rule                                            │
│                                                                      │
│  ┌─── General ─────────────────────────────────────────────────────┐ │
│  │  Name:         [ Order Shipped — Email + SMS              ]     │ │
│  │  Event Type:   [ order.shipped                      ▼ ]        │ │
│  │  Priority:     [ 10 ]    Exclusive: [ ] Checkbox               │ │
│  │  Delivery Priority: ( ) Inherit from event  (●) Critical       │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─── Conditions ──────────────────────────────────────────────────┐ │
│  │  All of the following conditions must be true:                  │ │
│  │                                                                 │ │
│  │  [ totalAmount ] [ $gte ] [ 50 ]                    [+ Add]    │ │
│  │  [ customerEmail ] [ $exists ] [ true ]             [× Remove] │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─── Actions ─────────────────────────────────────────────────────┐ │
│  │  Action 1:                                                      │ │
│  │  Template:     [ order-shipped                    ▼ ] [Preview] │ │
│  │  Channels:     [✓] Email  [✓] SMS  [ ] WhatsApp  [ ] Push      │ │
│  │  Recipients:   (●) Customer  ( ) Group  ( ) Custom              │ │
│  │  Delay:        [ 0 ] minutes                                    │ │
│  │                                                          [+ Add Action] │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─── Suppression (Optional) ──────────────────────────────────────┐ │
│  │  [ ] Enable suppression                                         │ │
│  │                                                                 │ │
│  │  Dedup Key Fields: [ eventType ] [ orderId ] [+ Add Field]     │ │
│  │                                                                 │ │
│  │  Modes:                                                         │ │
│  │  [✓] Dedup Window:     [ 60 ] minutes                          │ │
│  │  [ ] Max Count:        [ __ ] within [ __ ] minutes             │ │
│  │  [ ] Cooldown:         [ __ ] minutes                           │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [ Cancel ]                                           [ Save Rule ] │
└──────────────────────────────────────────────────────────────────────┘
```

#### Cross-Service Validation Feedback

When saving a rule, the notification-engine-service validates against multiple downstream services. If any check fails, the UI displays specific, actionable error messages:

```
┌──────────────────────────────────────────────────────────────┐
│  ✗ Rule validation failed:                                    │
│    • Event type 'order.archived' has no active mapping        │
│    • Template 'tpl-abc123' is inactive                        │
│    • Channel 'whatsapp' is not configured                     │
└──────────────────────────────────────────────────────────────┘
```

---

### 7.3 Template Editor (`/templates`)

#### Template List Page

| Feature | Description |
|---|---|
| **Display** | Card grid with template name, slug, channels (icons), current version, last updated, status |
| **Filters** | Channel (multi-select), Status (active/inactive), Search (name/slug) |
| **Actions** | Edit, Duplicate, Delete (soft), View version history |

#### Template Editor Page

```
┌──────────────────────────────────────────────────────────────────────┐
│  Template: Order Shipped                    v3 (current)  [History]  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  [ Email ]  [ SMS ]  [ WhatsApp ]  [ Push ]                    │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌──── Email Editor ─────────────────┐  ┌──── Live Preview ────────┐ │
│  │  Subject:                         │  │                          │ │
│  │  [ Your order {{orderId}} has     │  │  ┌────────────────────┐  │ │
│  │    shipped! ]                     │  │  │ Your order ORD-451 │  │ │
│  │                                   │  │  │ has shipped!       │  │ │
│  │  ┌──── WYSIWYG ────────────────┐ │  │  │                    │  │ │
│  │  │ B  I  U  H1 H2  Link  Img  │ │  │  │ Hi Jane,           │  │ │
│  │  │ Variable  ▼                 │ │  │  │                    │  │ │
│  │  ├─────────────────────────────┤ │  │  │ Your order         │  │ │
│  │  │                             │ │  │  │ ORD-2026-00451     │  │ │
│  │  │ Hi {{customerName}},        │ │  │  │ has been shipped   │  │ │
│  │  │                             │ │  │  │ and is on its way! │  │ │
│  │  │ Your order {{orderId}}      │ │  │  │                    │  │ │
│  │  │ has been shipped and is     │ │  │  │ Items:             │  │ │
│  │  │ on its way!                 │ │  │  │ - Wireless         │  │ │
│  │  │                             │ │  │  │   Headphones (1x)  │  │ │
│  │  │ Items:                      │ │  │  │                    │  │ │
│  │  │ {{#each items}}             │ │  │  │ Total: $79.99      │  │ │
│  │  │ - {{name}} ({{quantity}}x)  │ │  │  └────────────────────┘  │ │
│  │  │ {{/each}}                   │ │  │                          │ │
│  │  │                             │ │  │  Preview Variables:      │ │
│  │  │ Total: {{currency}}         │ │  │  { customerName: "Jane", │ │
│  │  │        {{totalAmount}}      │ │  │    orderId: "ORD-451",   │ │
│  │  └─────────────────────────────┘ │  │    items: [...],         │ │
│  │                                   │  │    totalAmount: 79.99 }  │ │
│  └───────────────────────────────────┘  └──────────────────────────┘ │
│                                                                      │
│  ┌─── Variables ─────────────────────────────────────────────────┐   │
│  │  Detected: customerName, orderId, items, currency,            │   │
│  │            totalAmount                                        │   │
│  │  Required: [✓] customerName  [✓] orderId  [ ] currency       │   │
│  │  Defaults: currency = "USD"                                   │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  [ Cancel ]                [ Preview All Channels ]  [ Save ]        │
└──────────────────────────────────────────────────────────────────────┘
```

#### Channel-Specific Editors

| Channel | Editor | Character Limit | Features |
|---|---|---|---|
| **Email** | TipTap WYSIWYG (HTML) | None | Rich text, images, links, variable insertion, HTML source toggle |
| **SMS** | Plain text textarea | 160 characters (counter) | Character counter, segment counter, variable insertion |
| **WhatsApp** | Plain text textarea | 4,096 characters | Variable insertion, media URL field, formatting preview |
| **Push** | Structured form | Title: 50, Body: 256 chars | Title + body fields, image URL, action URL, preview |

---

### 7.4 Channel Configuration (`/channels`)

#### Channel Cards Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Notification Channels                                               │
│                                                                      │
│  ┌────────────────────┐  ┌────────────────────┐                     │
│  │  Email              │  │  SMS                │                     │
│  │  Provider: Mailgun  │  │  Provider: Braze    │                     │
│  │  ● Healthy          │  │  ● Healthy          │                     │
│  │  Rate: 98.2%        │  │  Rate: 95.1%        │                     │
│  │  Sent (24h): 845    │  │  Sent (24h): 234    │                     │
│  │  [Configure]        │  │  [Configure]        │                     │
│  └────────────────────┘  └────────────────────┘                     │
│                                                                      │
│  ┌────────────────────┐  ┌────────────────────┐                     │
│  │  WhatsApp           │  │  Push               │                     │
│  │  Provider: Meta     │  │  Provider: Braze    │                     │
│  │  ● Healthy          │  │  ○ Not configured   │                     │
│  │  Rate: 97.0%        │  │                     │                     │
│  │  Sent (24h): 56     │  │  [Configure]        │                     │
│  │  [Configure]        │  │                     │                     │
│  └────────────────────┘  └────────────────────┘                     │
└──────────────────────────────────────────────────────────────────────┘
```

#### Provider Configuration Form

Each channel has a provider-specific configuration form with common patterns:

| Section | Fields |
|---|---|
| **Provider** | Provider type selector (e.g., Mailgun for email, Braze for SMS/push) |
| **Credentials** | API key (masked input with reveal toggle), auth token, webhook secret |
| **Sender Identity** | From email, from name, reply-to (email); sender ID (SMS); business number (WhatsApp) |
| **Advanced** | Retry settings, rate limit overrides, custom headers |
| **Actions** | Test connection (dry-run), Save, Reset to saved values |

---

### 7.5 Notification Logs (`/logs`)

#### Log List Page

| Feature | Description |
|---|---|
| **Columns** | Notification ID, Event Type, Recipient, Channel, Status (badge), Created At, Actions |
| **Filters** | Date range (picker), Channel (multi-select), Status (multi-select), Recipient (email search), Event Type (dropdown) |
| **Sorting** | Created date (default: descending) |
| **Pagination** | Server-side, 50 per page |
| **Expandable rows** | Click to expand inline lifecycle timeline |

#### Notification Detail Page (`/logs/:id`)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Notification Detail — NTF-af47ac10                                  │
│                                                                      │
│  ┌─── Summary ─────────────────────────────────────────────────────┐ │
│  │  Status: [DELIVERED]   Channel: Email   Priority: Normal        │ │
│  │  Event: order.shipped  Rule: Order Shipped — Email + SMS        │ │
│  │  Recipient: jane@example.com                                    │ │
│  │  Created: 2026-02-21 10:30:00 UTC                               │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─── Lifecycle Timeline ──────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  10:30:00.123  ● PENDING        Event received, rule matched   │ │
│  │       │                                                         │ │
│  │  10:30:00.456  ● PROCESSING     Resolving recipients           │ │
│  │       │                                                         │ │
│  │  10:30:00.789  ● RENDERING      Template rendering (email)     │ │
│  │       │                                                         │ │
│  │  10:30:01.234  ● DELIVERING     Dispatched to Mailgun          │ │
│  │       │                                                         │ │
│  │  10:30:01.567  ● SENT           Provider accepted (msg-id:...) │ │
│  │       │                                                         │ │
│  │  10:30:15.890  ● DELIVERED      Provider confirmed delivery    │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─── Rendered Content ────────────────────────────────────────────┐ │
│  │  [ Email ]  [ SMS ]  [ Push ]                                   │ │
│  │                                                                 │ │
│  │  Subject: Your order ORD-2026-00451 has shipped!                │ │
│  │  Body: [rendered HTML preview]                                  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─── Delivery Attempts ───────────────────────────────────────────┐ │
│  │  Attempt  Provider   Status      Duration   Provider Msg ID     │ │
│  │  1        Mailgun    Delivered   340ms      mg-msg-abc123       │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 7.6 Event Mappings (`/event-mappings`)

#### Mapping Editor Page

```
┌──────────────────────────────────────────────────────────────────────┐
│  Event Mapping: OMS Order Shipped                                    │
│                                                                      │
│  ┌─── General ─────────────────────────────────────────────────────┐ │
│  │  Source:      [ oms                              ▼ ]            │ │
│  │  Event Type:  [ order.shipped                      ]            │ │
│  │  Priority:    (●) Normal  ( ) Critical                          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─── Field Mappings ──────────────────────────────────────────────┐ │
│  │  Canonical Field    Source Path           Transform     Required │ │
│  │  ─────────────────────────────────────────────────────────────  │ │
│  │  orderId            data.orderNumber      toString      [✓]    │ │
│  │  customerEmail      data.customer.email   —             [✓]    │ │
│  │  customerName       data.customer.name    trim          [ ]    │ │
│  │  totalAmount        data.total            toNumber      [ ]    │ │
│  │  currency           data.currency         —             [ ]    │ │
│  │                     Default: "USD"                              │ │
│  │                                                    [+ Add Field]│ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─── Test Mapping ────────────────────────────────────────────────┐ │
│  │  Sample Payload (JSON):          Normalized Output:             │ │
│  │  ┌────────────────────────────┐  ┌─────────────────────────┐   │ │
│  │  │ {                          │  │ {                       │   │ │
│  │  │   "data": {                │  │   "eventId": "test-...",│   │ │
│  │  │     "orderNumber": "ORD-1",│  │   "sourceId": "oms",   │   │ │
│  │  │     "customer": {          │  │   "eventType":          │   │ │
│  │  │       "email": "j@ex.com", │  │     "order.shipped",   │   │ │
│  │  │       "name": "Jane"       │  │   "orderId": "ORD-1",  │   │ │
│  │  │     },                     │  │   "customerEmail":      │   │ │
│  │  │     "total": 79.99         │  │     "j@ex.com",        │   │ │
│  │  │   }                        │  │   "totalAmount": 79.99 │   │ │
│  │  │ }                          │  │ }                       │   │ │
│  │  └────────────────────────────┘  └─────────────────────────┘   │ │
│  │                                                                 │ │
│  │  [ Run Test ]                Warnings: 0   Errors: 0           │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [ Cancel ]                                           [ Save ]       │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 7.7 Bulk Upload (`/bulk-upload`)

#### Upload Page

```
┌──────────────────────────────────────────────────────────────────────┐
│  Bulk Upload                                            [Download    │
│                                                          Sample XLSX]│
│  ┌─── Upload Zone ─────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │        ┌───────────────────────────────────┐                    │ │
│  │        │                                   │                    │ │
│  │        │   Drag & drop XLSX file here      │                    │ │
│  │        │   or click to browse               │                    │ │
│  │        │                                   │                    │ │
│  │        │   Max: 10 MB · 5,000 rows         │                    │ │
│  │        └───────────────────────────────────┘                    │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─── Upload History ──────────────────────────────────────────────┐ │
│  │  File Name         Uploaded By  Date        Status    Rows      │ │
│  │  ──────────────────────────────────────────────────────────     │ │
│  │  orders-feb.xlsx   Jane Smith   Feb 21      ● Done    500/500  │ │
│  │  returns-q1.xlsx   John Doe     Feb 20      ● Partial 480/500  │ │
│  │  promos.xlsx       Jane Smith   Feb 19      ○ Processing 50%   │ │
│  │                                                                 │ │
│  │  [View Details]  [Download Result]  [Retry Failed]              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

#### Upload Progress (Real-Time Polling)

When an upload is processing, the UI polls `GET /api/v1/uploads/:id` on bulk-upload-service every 5 seconds:

```
┌──────────────────────────────────────────────────────────────┐
│  Processing: orders-feb.xlsx                                  │
│                                                               │
│  ████████████████████░░░░░░░░░░  68%                         │
│                                                               │
│  Total: 500 rows  Succeeded: 340  Failed: 0  Remaining: 160 │
│  Estimated time: ~45 seconds                                  │
│                                                               │
│  [ Cancel Upload ]                                            │
└──────────────────────────────────────────────────────────────┘
```

---

### 7.8 Recipient Groups (`/recipient-groups`)

| Feature | Description |
|---|---|
| **List** | Group name, Type (static/dynamic), Member count, Status, Created At |
| **Create static** | Name, description, add members (email, customerId, name) individually or via CSV paste |
| **Create dynamic** | Name, description, criteria builder (JSON or visual) |
| **Detail** | View members with pagination, add/remove members (static only), view rules using this group |
| **Delete** | Soft-delete with confirmation; warns if group is referenced by active rules |

---

### 7.9 Audit Log Viewer (`/audit`)

| Feature | Description |
|---|---|
| **Columns** | Timestamp, User, Action, Resource Type, Resource ID, IP Address |
| **Filters** | Date range, Action type, User, Resource type |
| **Expandable rows** | Show previous/new value diff for update operations |
| **Export** | CSV export of filtered results |

---

### 7.10 System Configuration (`/settings`)

```
┌──────────────────────────────────────────────────────────────────────┐
│  System Configuration                                                │
│                                                                      │
│  ┌─── Retention ───────────────────────────────────────────────────┐ │
│  │  retention.events.days          [ 90  ]  days                   │ │
│  │  retention.notifications.days   [ 365 ]  days                   │ │
│  │  retention.audit.days           [ 730 ]  days                   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─── Feature Flags ──────────────────────────────────────────────┐ │
│  │  feature.mapping_cache.enabled    [Toggle: ON ]                 │ │
│  │  feature.rule_cache.enabled       [Toggle: OFF]                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─── Rate Limits ────────────────────────────────────────────────┐ │
│  │  ratelimit.global.per_minute      [ 1000 ]                      │ │
│  │  ratelimit.api_key.per_minute     [ 100  ]                      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [ Save Changes ]                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 8. Component Architecture

### 8.1 Component Hierarchy

```
<RootLayout>
  <SWRConfig>                          ← Global SWR configuration
    <SidebarLayout>                    ← Sidebar navigation + header
      <Breadcrumbs />
      <PageContent>                    ← Route-specific page component
        <DataTable />                  ← Reusable sortable, filterable table
        <FormDialog />                 ← Modal forms for create/edit
        <ConfirmDialog />              ← Destructive action confirmation
        <Toast />                      ← Success/error notifications
      </PageContent>
    </SidebarLayout>
  </SWRConfig>
</RootLayout>
```

> **Info:** **No Auth Wrappers**
>
> There are no `SessionProvider`, `AuthGuard`, or `RBACProvider` components in this version. All UI elements are rendered unconditionally. When authentication is added in the future, these wrappers will be inserted between `<RootLayout>` and `<SidebarLayout>`.

### 8.2 Shared Component Library

| Component | Purpose | Props (key) |
|---|---|---|
| `DataTable` | Sortable, filterable, paginated table | `columns`, `data`, `onSort`, `onFilter`, `onPageChange` |
| `StatusBadge` | Color-coded status indicator | `status`, `variant` (success/warning/error/info) |
| `ConfirmDialog` | Destructive action confirmation modal | `title`, `message`, `onConfirm`, `destructive` |
| `EmptyState` | Placeholder for empty data sets | `icon`, `title`, `description`, `action` |
| `Pagination` | Server-side pagination controls | `page`, `totalPages`, `onPageChange` |
| `SearchInput` | Debounced search with clear button | `value`, `onChange`, `debounceMs` |
| `DateRangePicker` | Date range selector for filters | `from`, `to`, `onChange` |
| `ChannelIcon` | Channel-specific icon (email, sms, whatsapp, push) | `channel` |
| `LoadingSkeleton` | Content placeholder during loading | `variant` (table/card/form) |

---

## 9. API Integration Layer

### 9.1 Multi-Service API Client

The `apiClient` is a thin `fetch` wrapper that routes requests to the appropriate backend service based on a service key:

```
apiClient.get(service, path, options?)  →  GET  {baseUrl}/{path}
apiClient.post(service, path, body?)    →  POST {baseUrl}/{path}
apiClient.put(service, path, body?)     →  PUT  {baseUrl}/{path}
apiClient.delete(service, path)         →  DELETE {baseUrl}/{path}
```

The `service` parameter selects the base URL from environment configuration:

```
const SERVICE_URLS = {
  eventIngestion:     process.env.NEXT_PUBLIC_EVENT_INGESTION_URL,      // :3151
  notificationEngine: process.env.NEXT_PUBLIC_NOTIFICATION_ENGINE_URL,  // :3152
  template:           process.env.NEXT_PUBLIC_TEMPLATE_SERVICE_URL,     // :3153
  channelRouter:      process.env.NEXT_PUBLIC_CHANNEL_ROUTER_URL,       // :3154
  admin:              process.env.NEXT_PUBLIC_ADMIN_SERVICE_URL,        // :3155
  audit:              process.env.NEXT_PUBLIC_AUDIT_SERVICE_URL,        // :3156
  bulkUpload:         process.env.NEXT_PUBLIC_BULK_UPLOAD_URL,          // :3158
};
```

### 9.2 API Client Features

1. **Service routing**: Selects the correct base URL for each API call based on the service key.
2. **Response parsing**: Parses JSON responses and extracts `data` from standard response envelopes.
3. **Error handling**: Throws typed `ApiError` with status code, message, and field-level details (matching the backend standardized error schema: `{ code, details, message, status }`).
4. **No auth interceptor**: No token management, no 401 retry logic in this version.

### 9.3 Service Endpoint Map

#### Event Mappings (event-ingestion-service :3151)

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/event-mappings` | Mapping list |
| `GET` | `/api/v1/event-mappings/:id` | Mapping editor |
| `POST` | `/api/v1/event-mappings` | Create mapping |
| `PUT` | `/api/v1/event-mappings/:id` | Update mapping |
| `DELETE` | `/api/v1/event-mappings/:id` | Delete mapping |
| `POST` | `/api/v1/event-mappings/:id/test` | Test mapping with sample payload |

#### Notification Rules (notification-engine-service :3152)

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/rules` | Rule list with filters |
| `GET` | `/api/v1/rules/:id` | Rule detail / edit form |
| `POST` | `/api/v1/rules` | Create rule |
| `PUT` | `/api/v1/rules/:id` | Update rule |
| `DELETE` | `/api/v1/rules/:id` | Delete (deactivate) rule |

#### Recipient Groups (notification-engine-service :3152)

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/recipient-groups` | Group list |
| `GET` | `/api/v1/recipient-groups/:id` | Group detail with members |
| `POST` | `/api/v1/recipient-groups` | Create group |
| `PUT` | `/api/v1/recipient-groups/:id` | Update group |
| `DELETE` | `/api/v1/recipient-groups/:id` | Delete group |
| `GET` | `/api/v1/recipient-groups/:id/members` | List group members |
| `POST` | `/api/v1/recipient-groups/:id/members` | Add members |
| `DELETE` | `/api/v1/recipient-groups/:id/members/:memberId` | Remove member |

#### Templates (template-service :3153)

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/templates` | Template list |
| `GET` | `/api/v1/templates/:id` | Template editor with versions |
| `POST` | `/api/v1/templates` | Create template |
| `PUT` | `/api/v1/templates/:id` | Update template (new version) |
| `DELETE` | `/api/v1/templates/:id` | Soft-delete template |
| `POST` | `/api/v1/templates/:id/preview` | Live preview with sample data |
| `PUT` | `/api/v1/templates/:id/rollback` | Rollback to previous version |

#### Channels & Providers (channel-router-service :3154)

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/channels` | Channel list with health |
| `GET` | `/api/v1/channels/:id` | Channel configuration detail |
| `PUT` | `/api/v1/channels/:id` | Update channel configuration |
| `GET` | `/api/v1/providers` | Provider list |
| `POST` | `/api/v1/providers` | Register provider |
| `PUT` | `/api/v1/providers/:id` | Update provider |
| `DELETE` | `/api/v1/providers/:id` | Deregister provider |

#### System Configuration (admin-service :3155)

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/system-configs` | System settings page |
| `PUT` | `/api/v1/system-configs/:key` | Update configuration value |

#### Dashboard, Logs, Audit & Tracing (audit-service :3156)

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/analytics/summary` | Dashboard metrics and charts |
| `GET` | `/api/v1/logs` | Notification log list |
| `GET` | `/api/v1/logs/:id` | Notification detail |
| `GET` | `/api/v1/search` | Full-text search across audit events |
| `GET` | `/api/v1/trace/:notificationId` | Full lifecycle trace |
| `GET` | `/api/v1/receipts` | Delivery receipts |

#### Bulk Upload (bulk-upload-service :3158)

| Method | Endpoint | UI Feature |
|---|---|---|
| `POST` | `/api/v1/uploads` | File upload (`multipart/form-data`) |
| `GET` | `/api/v1/uploads` | Upload history list |
| `GET` | `/api/v1/uploads/:id` | Upload status / progress |
| `POST` | `/api/v1/uploads/:id/retry` | Retry failed rows |
| `DELETE` | `/api/v1/uploads/:id` | Cancel / delete upload |
| `GET` | `/api/v1/uploads/:id/result` | Download result XLSX |

---

## 10. Routing & Navigation

### 10.1 Route Structure

| Route | Page | Auth | Min Role |
|---|---|---|---|
| `/dashboard` | Dashboard | None | — |
| `/rules` | Rule list | None | — |
| `/rules/new` | Create rule | None | — |
| `/rules/:id` | Rule detail / edit | None | — |
| `/rules/:id/history` | Rule change history | None | — |
| `/templates` | Template list | None | — |
| `/templates/new` | Create template | None | — |
| `/templates/:id` | Template editor | None | — |
| `/templates/:id/versions` | Version history | None | — |
| `/channels` | Channel list | None | — |
| `/channels/:id` | Channel configuration | None | — |
| `/logs` | Notification log list | None | — |
| `/logs/:id` | Notification detail / trace | None | — |
| `/event-mappings` | Mapping list | None | — |
| `/event-mappings/new` | Create mapping | None | — |
| `/event-mappings/:id` | Mapping editor / test | None | — |
| `/bulk-upload` | Upload zone + history | None | — |
| `/bulk-upload/:id` | Upload detail | None | — |
| `/recipient-groups` | Group list | None | — |
| `/recipient-groups/new` | Create group | None | — |
| `/recipient-groups/:id` | Group detail | None | — |
| `/audit` | Audit log viewer | None | — |
| `/settings` | System configuration | None | — |

### 10.2 Sidebar Navigation

```
┌─────────────────────────┐
│  Notification API        │
│                          │
│  Dashboard               │
│                          │
│  MANAGEMENT              │
│  ├─ Rules                │
│  ├─ Templates            │
│  ├─ Event Mappings       │
│  ├─ Channels             │
│  └─ Recipient Groups     │
│                          │
│  OPERATIONS              │
│  ├─ Notification Logs    │
│  ├─ Bulk Upload          │
│  └─ Audit Logs           │
│                          │
│  SYSTEM                  │
│  └─ Settings             │
│                          │
└─────────────────────────┘
```

All sidebar items are visible unconditionally — no role-based hiding. When authentication is added in the future, conditional rendering based on RBAC permissions will be applied.

---

## 11. Flowcharts

### 11.1 Rule Creation Flow (End-to-End)

```
    ┌─────────────────────────┐
    │  1. User clicks          │
    │     "Create Rule"        │
    └────────────┬─────────────┘
                 ▼
    ┌─────────────────────────┐
    │  2. Load form data       │
    │  - Event types (from     │
    │    event-mappings list)  │
    │  - Templates (active)    │
    │  - Channels (configured) │
    └────────────┬─────────────┘
                 ▼
    ┌─────────────────────────┐
    │  3. User fills form      │
    │  - Name, event type      │
    │  - Conditions (builder)  │
    │  - Actions (template,    │
    │    channels, recipients) │
    │  - Suppression (optional)│
    └────────────┬─────────────┘
                 ▼
    ┌─────────────────────────┐
    │  4. Client-side          │  ◄── Zod schema validation
    │     validation           │
    └────────────┬─────────────┘
                 ▼
     ◆ Validation passed?      ◆────── No ──▶ Show field errors
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  5. POST /api/v1/rules   │  ◄── To notification-engine-service
    └────────────┬─────────────┘
                 ▼
     ◆ Server validation       ◆
     ◆ passed?                 ◆
                 │
        ┌────── No ──────┐         ┌────── Yes ──────┐
        ▼                │         ▼                  │
    ┌────────────────┐   │    ┌────────────────────┐  │
    │ Show server    │   │    │ 6. Show success    │  │
    │ validation     │   │    │ toast              │  │
    │ errors:        │   │    │                    │  │
    │ - Template not │   │    │ 7. Redirect to     │  │
    │   found        │   │    │ /rules             │  │
    │ - Channel not  │   │    │                    │  │
    │   configured   │   │    │ 8. Invalidate SWR  │  │
    │ - Event type   │   │    │ cache for rules    │  │
    │   has no       │   │    └────────────────────┘  │
    │   mapping      │   │                            │
    └────────────────┘   │                            │
                         └────────────────────────────┘
```

### 11.2 Template Save & Version Flow

```
    ┌─────────────────────────┐
    │  1. User edits template  │
    │     content in editor    │
    └────────────┬─────────────┘
                 ▼
    ┌─────────────────────────┐
    │  2. Client-side          │
    │     validation:          │
    │  - Slug format valid     │
    │  - At least one channel  │
    │  - Handlebars syntax OK  │
    │  - Char limits per       │
    │    channel met           │
    └────────────┬─────────────┘
                 ▼
     ◆ Valid?                  ◆────── No ──▶ Show errors
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  3. PUT /api/v1/         │  ◄── To template-service
    │     templates/:id        │
    └────────────┬─────────────┘
                 ▼
    ┌─────────────────────────┐
    │  4. Template Service     │  ◄── Creates new version (immutable)
    │     creates new version  │      Previous versions retained
    └────────────┬─────────────┘
                 ▼
    ┌─────────────────────────┐
    │  5. UI updates:          │
    │  - Version number bumped │
    │  - Version history shows │
    │    new entry             │
    │  - "Saved" toast shown   │
    └─────────────────────────┘
```

### 11.3 Bulk Upload Processing Flow

```
    ┌─────────────────────────┐
    │  1. User drops XLSX      │
    │     file on upload zone  │
    └────────────┬─────────────┘
                 ▼
    ┌─────────────────────────┐
    │  2. Client-side checks:  │
    │  - File is .xlsx         │
    │  - File <= 10 MB         │
    └────────────┬─────────────┘
                 ▼
     ◆ Valid?                  ◆────── No ──▶ Show error message
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  3. POST /api/v1/        │  ◄── To bulk-upload-service
    │     uploads              │      multipart/form-data
    └────────────┬─────────────┘
                 ▼
    ┌─────────────────────────┐
    │  4. Receive 202 Accepted │  ◄── { uploadId, status: "validating" }
    │     + uploadId           │
    └────────────┬─────────────┘
                 ▼
    ┌─────────────────────────┐
    │  5. Start polling:       │  ◄── GET /api/v1/uploads/:id
    │     every 5 seconds      │      on bulk-upload-service
    └────────────┬─────────────┘
                 ▼
     ◆ Status?                 ◆
                 │
    ┌── processing ──┐   ┌── completed/partial ──┐   ┌── failed ──┐
    ▼                │   ▼                        │   ▼            │
┌────────────┐      │  ┌──────────────────────┐  │  ┌──────────┐ │
│ Update     │      │  │ Show final stats:    │  │  │ Show     │ │
│ progress   │──────┘  │ succeeded / failed   │  │  │ error    │ │
│ bar and    │         │ row counts           │  │  │ details  │ │
│ counters   │         │                      │  │  └──────────┘ │
└────────────┘         │ Enable:              │  │               │
                       │ - Download Result    │  │               │
                       │ - View Errors        │  │               │
                       │ - Retry Failed       │  │               │
                       └──────────────────────┘  │               │
                                                 └───────────────┘
```

### 11.4 Mapping Test Flow

```
    ┌─────────────────────────┐
    │  1. User enters sample   │
    │     JSON payload in      │
    │     Monaco editor        │
    └────────────┬─────────────┘
                 ▼
    ┌─────────────────────────┐
    │  2. User clicks          │
    │     "Run Test"           │
    └────────────┬─────────────┘
                 ▼
    ┌─────────────────────────┐
    │  3. Client-side JSON     │  ◄── Parse check only
    │     syntax validation    │
    └────────────┬─────────────┘
                 ▼
     ◆ Valid JSON?             ◆────── No ──▶ Show parse error
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  4. POST /api/v1/        │  ◄── To event-ingestion-service
    │     event-mappings/      │
    │     :id/test             │
    │     { samplePayload }    │
    └────────────┬─────────────┘
                 ▼
    ┌─────────────────────────┐
    │  5. Display results:     │
    │  - Normalized event JSON │
    │  - Warning list          │
    │  - Error list            │
    └─────────────────────────┘
```

---

## 12. Sequence Diagrams

### 12.1 Dashboard Data Loading (with SSR Prefetch)

```
Browser              Next.js Server         Audit Service :3156   Channel Router :3154
   │                      │                      │                      │
   │  GET /dashboard      │                      │                      │
   │─────────────────────▶│                      │                      │
   │                      │                      │                      │
   │                      │  [Server Component]  │                      │
   │                      │                      │                      │
   │                      │  GET /api/v1/        │                      │
   │                      │  analytics/summary   │                      │
   │                      │─────────────────────▶│                      │
   │                      │  200 OK { data }     │                      │
   │                      │◄─────────────────────│                      │
   │                      │                      │                      │
   │                      │  GET /api/v1/        │                      │
   │                      │  channels            │                      │
   │                      │─────────────────────────────────────────────▶│
   │                      │  200 OK { channels } │                      │
   │                      │◄─────────────────────────────────────────────│
   │                      │                      │                      │
   │  HTML with           │                      │                      │
   │  prefetched data     │                      │                      │
   │  (SWR fallback)      │                      │                      │
   │◄─────────────────────│                      │                      │
   │                      │                      │                      │
   │  [Client hydration]  │                      │                      │
   │  SWR uses fallback   │                      │                      │
   │  data — no loading   │                      │                      │
   │  spinner on first    │                      │                      │
   │  paint               │                      │                      │
   │                      │                      │                      │
   │  [SWR starts polling │                      │                      │
   │   every 30 seconds]  │                      │                      │
```

### 12.2 Template Preview (Live)

```
Browser              Admin UI             Template Service :3153
   │                      │                      │
   │  Type in editor      │                      │
   │  (debounced 500ms)   │                      │
   │─────────────────────▶│                      │
   │                      │                      │
   │                      │  POST /api/v1/       │
   │                      │  templates/:id/      │
   │                      │  preview             │
   │                      │  { sampleData }      │
   │                      │─────────────────────▶│
   │                      │                      │
   │                      │  Render Handlebars   │
   │                      │  with sample data    │
   │                      │                      │
   │                      │  200 OK              │
   │                      │  { renderedHtml,     │
   │                      │    renderedSms,      │
   │                      │    renderedPush }    │
   │                      │◄─────────────────────│
   │                      │                      │
   │  Update preview      │                      │
   │  panel with rendered │                      │
   │  content             │                      │
   │◄─────────────────────│                      │
```

### 12.3 Rule Save with Cross-Service Validation

```
Browser              Admin UI             Notif Engine :3152
   │                      │                      │
   │  Click "Save Rule"   │                      │
   │─────────────────────▶│                      │
   │                      │                      │
   │                      │  POST /api/v1/rules  │
   │                      │  { name, eventType,  │
   │                      │    conditions, ...}  │
   │                      │─────────────────────▶│
   │                      │                      │
   │                      │  Validates rule:     │
   │                      │  - Template exists   │
   │                      │  - Channels valid    │
   │                      │  - Event type mapped │
   │                      │                      │
   │                      │  201 Created         │
   │                      │  { rule: {...} }     │
   │                      │◄─────────────────────│
   │                      │                      │
   │  "Rule saved"        │                      │
   │  toast + redirect    │                      │
   │  to /rules           │                      │
   │◄─────────────────────│                      │
```

---

## 13. Entity Relationship: UI Data Model

The Admin UI does not have its own database, but it operates on a well-defined data model derived from the API responses. The following diagram shows the logical relationships between the primary entities as understood by the frontend.

```
┌──────────────────────────────┐           ┌──────────────────────────────┐
│     NotificationRule          │           │         Template              │
├──────────────────────────────┤           ├──────────────────────────────┤
│  id               UUID       │    uses   │  id               UUID       │
│  name             string     │──────────▶│  name             string     │
│  eventType        string     │           │  slug             string     │
│  conditions       JSON       │           │  currentVersion   number     │
│  actions          Action[]   │           │  channels         string[]   │
│  suppression      JSON?      │           │  isActive         boolean    │
│  deliveryPriority string?    │           │  versions         Version[]  │
│  priority         number     │           └──────────┬───────────────────┘
│  isExclusive      boolean    │                      │ has many
│  isActive         boolean    │                      ▼
└──────────┬───────────────────┘           ┌──────────────────────────────┐
           │ matched by                    │      TemplateVersion          │
           ▼                               ├──────────────────────────────┤
┌──────────────────────────────┐           │  id               UUID       │
│       Notification            │           │  versionNumber    number     │
├──────────────────────────────┤           │  channels         Content[]  │
│  id               UUID       │           │  createdAt        datetime   │
│  eventId          UUID       │           └──────────────────────────────┘
│  ruleId           UUID       │
│  templateId       UUID       │
│  status           string     │           ┌──────────────────────────────┐
│  channel          string     │           │       EventMapping            │
│  recipient        string     │           ├──────────────────────────────┤
│  createdAt        datetime   │           │  id               UUID       │
│  statusLog        LogEntry[] │           │  sourceId          string     │
│  deliveryAttempts Attempt[]  │           │  eventType         string     │
└──────────────────────────────┘           │  name              string     │
                                           │  fieldMappings     JSON       │
┌──────────────────────────────┐           │  priority          string     │
│         Channel               │           │  isActive          boolean    │
├──────────────────────────────┤           │  version           number     │
│  id               UUID       │           └──────────────────────────────┘
│  channel          string     │
│  provider         string     │           ┌──────────────────────────────┐
│  status           string     │           │      RecipientGroup           │
│  health           string     │           ├──────────────────────────────┤
│  senderIdentity   JSON       │           │  id               UUID       │
│  deliveryRate24h  number     │           │  name             string     │
└──────────────────────────────┘           │  type             string     │
                                           │  memberCount      number     │
┌──────────────────────────────┐           │  criteria         JSON?      │
│        BulkUpload             │           │  isActive         boolean    │
├──────────────────────────────┤           └──────────────────────────────┘
│  id               UUID       │
│  fileName         string     │           ┌──────────────────────────────┐
│  status           string     │           │       DashboardStats          │
│  totalRows        number     │           ├──────────────────────────────┤
│  succeededRows    number     │           │  volume           VolumeData │
│  failedRows       number     │           │  deliveryRates    RateData   │
│  totalEvents      number?    │           │  topRules         RuleStats[]│
│  uploadedBy       string     │           │  failures         Failure[]  │
│  createdAt        datetime   │           │  channelHealth    Health[]   │
│  resultFilePath   string?    │           │  sources          Source[]   │
└──────────────────────────────┘           │  meta.degraded    boolean    │
                                           └──────────────────────────────┘

Relationships:
  NotificationRule ──uses──▶ Template (via actions[].templateId)
  NotificationRule ──uses──▶ RecipientGroup (via actions[].recipientGroupId)
  NotificationRule ──filters──▶ EventMapping (via eventType match)
  Notification ──references──▶ NotificationRule (via ruleId)
  Notification ──references──▶ Template (via templateId)
  Notification ──delivered via──▶ Channel
  BulkUpload ──generates──▶ Notification (via Event Ingestion pipeline)
```

---

## 14. Error Handling & User Feedback

### 14.1 Error Categories

| Error Type | HTTP Status | UI Behavior |
|---|---|---|
| **Validation error** | 400 | Highlight specific form fields with error messages |
| **Not found** | 404 | Show "resource not found" empty state with back navigation |
| **Conflict** | 409 | Show specific conflict message (e.g., "Slug already in use") |
| **Server error** | 500 | Show generic error message with retry option |
| **Service unavailable** | 503 | Show "Service temporarily unavailable" with retry |
| **Network error** | — | Show offline banner with automatic reconnection detection |

### 14.2 Toast Notifications

| Type | Duration | Use Case |
|---|---|---|
| **Success** | 3 seconds (auto-dismiss) | Resource created, updated, deleted |
| **Error** | Persistent (manual dismiss) | API errors, validation failures |
| **Warning** | 5 seconds | Degraded dashboard data, service unreachable |
| **Info** | 4 seconds | Background operation completed (e.g., bulk upload done) |

### 14.3 Form Validation Pattern

All forms implement two-tier validation:

1. **Client-side (Zod)**: Immediate feedback as the user types or on blur. Validates format, required fields, length constraints.
2. **Server-side (API)**: Validates business rules (e.g., template exists, channel configured). Server errors are mapped to the corresponding form fields where possible.

```
    ┌─────────────────────────┐
    │  User submits form       │
    └────────────┬─────────────┘
                 ▼
    ┌─────────────────────────┐
    │  Zod schema validation   │  ◄── Instant, client-side
    └────────────┬─────────────┘
                 ▼
     ◆ Valid?                  ◆────── No ──▶ Show field errors (red borders,
                 │                            inline messages)
                Yes
                 ▼
    ┌─────────────────────────┐
    │  Submit to API           │  ◄── Loading state on button
    └────────────┬─────────────┘
                 ▼
     ◆ API success?            ◆
                 │
        ┌────── No ──────┐         ┌────── Yes ──────┐
        ▼                │         ▼                  │
   ┌──────────────┐      │    ┌────────────────────┐  │
   │ Map API      │      │    │ Success toast +    │  │
   │ errors to    │      │    │ redirect or close  │  │
   │ form fields  │      │    │ dialog             │  │
   │ (if field-   │      │    └────────────────────┘  │
   │ level) or    │      │                            │
   │ show error   │      │                            │
   │ banner       │      │                            │
   └──────────────┘      │                            │
                         └────────────────────────────┘
```

---

## 15. Accessibility & Responsive Design

### 15.1 Accessibility Standards

| Standard | Implementation |
|---|---|
| **WCAG 2.1 AA** | Target compliance level |
| **Keyboard navigation** | All interactive elements reachable via Tab; Enter/Space to activate; Escape to close modals |
| **Screen readers** | Semantic HTML, ARIA labels, ARIA live regions for dynamic content (toasts, loading states) |
| **Color contrast** | Minimum 4.5:1 ratio for normal text, 3:1 for large text (enforced via Tailwind config) |
| **Focus indicators** | Visible focus ring on all interactive elements |
| **Error announcements** | Form validation errors announced via `aria-live="polite"` |
| **Reduced motion** | Respects `prefers-reduced-motion` media query for animations |

### 15.2 Responsive Breakpoints

| Breakpoint | Width | Layout Behavior |
|---|---|---|
| **Desktop** | >= 1280px | Full sidebar + main content |
| **Tablet** | 768px - 1279px | Collapsible sidebar (hamburger menu) |
| **Mobile** | < 768px | Bottom navigation, stacked layouts, simplified tables |

> **Info:** **Primary Target: Desktop**
>
> The Admin UI is primarily designed for desktop use by the operative team. Tablet and mobile layouts are supported for monitoring and read-only access (dashboard, logs) but complex operations (template editing, mapping builder) are optimized for desktop screen sizes.

---

## 16. Testing Strategy

### 16.1 Unit Tests (Jest)

| Scope | Coverage Target | Examples |
|---|---|---|
| **Custom hooks** | 90%+ | `useRules`, `useBulkUpload`, `useDashboard` |
| **Utility functions** | 95%+ | Date formatters, validators, API error parsing |
| **Zod schemas** | 100% | All form validation schemas |
| **API client** | 90%+ | Error handling, service routing, response parsing |

### 16.2 Component Tests (Jest + React Testing Library)

| Scope | Coverage Target | Examples |
|---|---|---|
| **Form components** | 85%+ | RuleForm, TemplateEditor, MappingBuilder |
| **Data display** | 80%+ | DataTable, StatusBadge, NotificationTimeline |

### 16.3 End-to-End Tests (Playwright)

| Flow | Browser Targets | Description |
|---|---|---|
| Dashboard | Chromium | Verify all widgets render, period selector changes data |
| Rule CRUD | Chromium | Create, edit, toggle, delete a notification rule |
| Template editing | Chromium, Firefox | Create template, edit content, preview, save new version |
| Bulk upload | Chromium | Upload XLSX, monitor progress, download result |
| Mapping test | Chromium | Create mapping, run test with sample payload |

### 16.4 Test Configuration

```
Playwright config:
  baseURL: http://localhost:3159
  webServer: { command: "npm run dev", port: 3159 }
  projects: [chromium, firefox, webkit]
  retries: 2 (CI), 0 (local)
  reporter: allure-playwright
```

See [05 — Testing Strategy](05-testing-strategy.md) for the full testing framework specification, Allure reporting, and CI/CD integration.

---

## 17. Security Considerations

| Concern | Mitigation |
|---|---|
| **XSS prevention** | React's default JSX escaping; DOMPurify for any `dangerouslySetInnerHTML` (template preview only); Content-Security-Policy headers |
| **Input sanitization** | Zod validation on all form inputs before submission; server-side validation as final authority |
| **Sensitive data masking** | Channel credentials displayed as masked values (`SG.***...xYz`); passwords never shown |
| **Clickjacking** | `X-Frame-Options: DENY` and `frame-ancestors 'none'` in CSP |
| **Dependency security** | `npm audit` in CI pipeline; Dependabot for automated dependency updates |
| **Content Security Policy** | Strict CSP headers: `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline'` (Tailwind); `img-src 'self' data: https:`; `connect-src 'self' {SERVICE_URLS}` |
| **HTTPS only** | `Strict-Transport-Security: max-age=31536000; includeSubDomains` in production |

> **Info:** **Authentication Deferred**
>
> Token storage (access tokens in memory, refresh tokens in HTTP-only cookies) and CSRF protection will be added when authentication is integrated. See §5 for the future integration path.

---

## 18. Monitoring & Observability

### 18.1 Client-Side Metrics

| Metric | Description | Collection Method |
|---|---|---|
| **Page load time** | Time to interactive for each page | `Performance` API + custom reporting |
| **API call latency** | Request duration per endpoint per service | API client interceptor |
| **API error rate** | Failed API calls by status code and target service | API client interceptor |
| **User actions** | CRUD operations by type and outcome | Event logging in mutation hooks |

### 18.2 Error Tracking

| Category | Approach |
|---|---|
| **Unhandled errors** | Global error boundary component captures React render errors; displays fallback UI |
| **API errors** | Centralized error handler in API client; structured logging for debugging |
| **Network failures** | Online/offline detection via `navigator.onLine` and `window` events |
| **Service health** | Per-service connectivity tracking in the API client; degraded mode when services are unreachable |

### 18.3 Health Monitoring

The Admin UI reports its own health via a lightweight endpoint for container orchestration:

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Next.js API route returning `{ status: "healthy", version: "x.y.z" }` for Docker/Kubernetes liveness probes |

---

## 19. Configuration & Environment Variables

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_EVENT_INGESTION_URL` | Event Ingestion Service base URL | `http://localhost:3151` |
| `NEXT_PUBLIC_NOTIFICATION_ENGINE_URL` | Notification Engine Service base URL | `http://localhost:3152` |
| `NEXT_PUBLIC_TEMPLATE_SERVICE_URL` | Template Service base URL | `http://localhost:3153` |
| `NEXT_PUBLIC_CHANNEL_ROUTER_URL` | Channel Router Service base URL | `http://localhost:3154` |
| `NEXT_PUBLIC_ADMIN_SERVICE_URL` | Admin Service base URL | `http://localhost:3155` |
| `NEXT_PUBLIC_AUDIT_SERVICE_URL` | Audit Service base URL | `http://localhost:3156` |
| `NEXT_PUBLIC_BULK_UPLOAD_URL` | Bulk Upload Service base URL | `http://localhost:3158` |
| `NEXT_PUBLIC_APP_NAME` | Application name in header/title | `Notification API` |
| `NEXT_PUBLIC_POLLING_INTERVAL_DASHBOARD` | Dashboard metrics polling interval (ms) | `30000` |
| `NEXT_PUBLIC_POLLING_INTERVAL_UPLOAD` | Bulk upload status polling interval (ms) | `5000` |
| `NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB` | Maximum XLSX file size | `10` |
| `NEXT_PUBLIC_MAX_UPLOAD_ROWS` | Maximum rows per XLSX upload | `5000` |
| `NEXT_PUBLIC_DEBOUNCE_SEARCH_MS` | Search input debounce delay (ms) | `300` |
| `NEXT_PUBLIC_DEBOUNCE_PREVIEW_MS` | Template preview debounce delay (ms) | `500` |
| `NEXT_PUBLIC_DEFAULT_PAGE_SIZE` | Default pagination size | `50` |
| `PORT` | Server listening port | `3159` |
| `NODE_ENV` | Environment (`development`, `production`, `test`) | `development` |

---

## 20. Deployment

### 20.1 Docker Configuration

```
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3159
ENV PORT=3159
CMD ["node", "server.js"]
```

### 20.2 Docker Compose Entry

```yaml
notification-admin-ui:
  build: ./notification-admin-ui
  ports:
    - "3159:3159"
  environment:
    - NEXT_PUBLIC_EVENT_INGESTION_URL=http://event-ingestion-service:3151
    - NEXT_PUBLIC_NOTIFICATION_ENGINE_URL=http://notification-engine-service:3152
    - NEXT_PUBLIC_TEMPLATE_SERVICE_URL=http://template-service:3153
    - NEXT_PUBLIC_CHANNEL_ROUTER_URL=http://channel-router-service:3154
    - NEXT_PUBLIC_ADMIN_SERVICE_URL=http://admin-service:3155
    - NEXT_PUBLIC_AUDIT_SERVICE_URL=http://audit-service:3156
    - NEXT_PUBLIC_BULK_UPLOAD_URL=http://bulk-upload-service:3158
    - NODE_ENV=production
  depends_on:
    - event-ingestion-service
    - notification-engine-service
    - template-service
    - channel-router-service
    - admin-service
    - audit-service
    - bulk-upload-service
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "http://localhost:3159/api/health"]
    interval: 30s
    timeout: 5s
    retries: 3
```

### 20.3 Build & Deployment Pipeline

| Stage | Action | Tools |
|---|---|---|
| **Lint** | ESLint + Prettier check | `npm run lint` |
| **Type Check** | TypeScript compilation | `npm run type-check` |
| **Unit Tests** | Jest with coverage threshold | `npm run test -- --coverage` |
| **E2E Tests** | Playwright against local dev server | `npm run test:e2e` |
| **Build** | Next.js production build (standalone output) | `npm run build` |
| **Docker** | Build and push container image | `docker build -t notification-admin-ui:latest .` |
| **Deploy** | Rolling update with health check | Docker Compose or Kubernetes |

### 20.4 Performance Optimization

| Technique | Description |
|---|---|
| **Standalone output** | Next.js standalone mode reduces Docker image size (~100 MB vs ~500 MB) |
| **Server Components** | Pages without interactivity rendered as server components — reduced client JS bundle |
| **Code splitting** | Per-route code splitting via App Router; heavy components (TipTap, Monaco, Recharts) lazy-loaded |
| **Image optimization** | Next.js `<Image>` component for automatic WebP conversion and lazy loading |
| **SWR caching** | Avoids redundant API calls; stale data shown instantly while revalidating in background |
| **Static assets** | Fonts, icons, and CSS served with immutable cache headers |

---

*Notification API Documentation v2.0 -- Architecture Team -- 2026*
