> **Note:** This is a convenience copy. The authoritative version is at `../../docs/15-notification-admin-ui.md`.

---

# 15 — Notification Admin UI

**Notification API — Admin Frontend Deep-Dive**

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
3. [Technology Stack & Libraries](#3-technology-stack--libraries)
4. [Application Structure](#4-application-structure)
5. [Authentication & Session Management](#5-authentication--session-management)
6. [Role-Based Access Control (RBAC) in the UI](#6-role-based-access-control-rbac-in-the-ui)
7. [Data Fetching & State Management](#7-data-fetching--state-management)
8. [Page Specifications](#8-page-specifications)
9. [Component Architecture](#9-component-architecture)
10. [API Integration Layer](#10-api-integration-layer)
11. [Routing & Navigation](#11-routing--navigation)
12. [Flowcharts](#12-flowcharts)
13. [Sequence Diagrams](#13-sequence-diagrams)
14. [Entity Relationship: UI Data Model](#14-entity-relationship-ui-data-model)
15. [Error Handling & User Feedback](#15-error-handling--user-feedback)
16. [Accessibility & Responsive Design](#16-accessibility--responsive-design)
17. [Testing Strategy](#17-testing-strategy)
18. [Security Considerations](#18-security-considerations)
19. [Monitoring & Observability](#19-monitoring--observability)
20. [Configuration & Environment Variables](#20-configuration--environment-variables)
21. [Deployment](#21-deployment)

---

## 1. Service Overview

The Notification Admin UI is the self-service Next.js backoffice application that enables the operative team to configure, manage, and monitor every aspect of the Notification API platform. It is the only user-facing frontend in the system — all other microservices are headless APIs.

| Attribute | Value |
|---|---|
| **Technology** | Next.js 14 (App Router) with TypeScript |
| **Port** | `3159` |
| **Database** | None — all data through API |
| **Dependencies** | Notification Gateway (BFF) only — port `3150` |
| **Source Repo Folder** | `notification-admin-ui/` |
| **Authentication** | JWT bearer tokens (access + refresh via HTTP-only cookie) |

### Responsibilities

1. **Authentication Interface:** Login page with local credentials (email/password) and SAML 2.0 SSO button. Password reset flow. Session management with automatic token refresh.
2. **Dashboard & Analytics:** Real-time notification volume charts, delivery success rates, channel breakdowns, failure analysis, top triggered rules, and system health indicators — with graceful degradation for partial data.
3. **Notification Rule Management:** List, create, edit, and delete notification rules with a visual condition builder, template picker, channel selector, recipient configuration, suppression settings, and delivery priority override.
4. **Template Management:** WYSIWYG editor for HTML email templates, plain text editors for SMS and WhatsApp, push notification previewer. Live preview with variable interpolation, version history, and rollback.
5. **Channel Configuration:** Channel health cards, provider configuration forms (SendGrid, Mailgun, Braze, Twilio, FCM), connection testing, and credential rotation workflows.
6. **Event Mapping Management:** Visual mapping builder for runtime field mapping configurations. Mapping test panel with sample payload input and normalized output preview. Priority configuration.
7. **Notification Logs & Tracing:** Searchable, filterable log table with expandable detail rows. Full notification lifecycle timeline, rendered content preview, and delivery attempt history.
8. **Bulk Upload:** Drag-and-drop XLSX upload, real-time processing progress, upload history, error detail panel with export, and sample template download.
9. **User Management:** Admin user CRUD with role assignment, password reset, deactivation, and activity log. Restricted to Super Admin and Admin roles.
10. **System Configuration:** Global platform settings management (retention, feature flags, rate limits). Super Admin only.
11. **SAML Identity Provider Settings:** IdP metadata import, attribute mapping, auto-provisioning toggle, SP metadata download, and certificate expiry warnings. Super Admin only.
12. **Recipient Group Management:** Create and manage static and dynamic recipient groups for use in notification rules.

> **Info:** **BFF-Only Communication**
>
> The Notification Admin UI communicates **exclusively** through the Notification Gateway (BFF) on port `3150`. It never calls internal microservices directly. This provides a single security boundary, consistent API surface, and allows the gateway to handle authentication, rate limiting, and response transformation. All API calls flow through a single integration layer that prepends the gateway base URL and attaches authentication headers.

---

## 2. Architecture & Integration Points

The Admin UI sits in the Edge Layer of the platform architecture, alongside the Notification Gateway. It is a pure presentation-tier application with no backend state — every piece of data is fetched from and persisted through the Gateway API.

### Figure 2.1 — Integration Context

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       Notification Admin UI :3159                              │
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │                         Next.js App Router                               │ │
│  │                                                                          │ │
│  │   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │ │
│  │   │Dashboard │ │Rules     │ │Templates │ │Channels  │ │Notification  │ │ │
│  │   │Page      │ │Page      │ │Page      │ │Page      │ │Logs Page     │ │ │
│  │   └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │ │
│  │   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │ │
│  │   │Event     │ │Bulk      │ │Users     │ │Settings  │ │Recipient     │ │ │
│  │   │Mappings  │ │Upload    │ │Page      │ │Page      │ │Groups Page   │ │ │
│  │   └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │ │
│  │                                                                          │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │   │                    API Integration Layer                         │   │ │
│  │   │  apiClient (fetch wrapper) · SWR hooks · Auth interceptor       │   │ │
│  │   └────────────────────────────────┬────────────────────────────────┘   │ │
│  └────────────────────────────────────┼────────────────────────────────────┘ │
└───────────────────────────────────────┼──────────────────────────────────────┘
                                        │ HTTPS (all API calls)
                                        │ Authorization: Bearer {JWT}
                                        │ Cookie: refreshToken=...
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      Notification Gateway :3150 (BFF)                         │
│                                                                               │
│  Auth · RBAC · Rate Limiting · Validation · Service Proxy                    │
│                                                                               │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ │
│  │Admin Svc   │ │Notif Engine│ │Template Svc│ │Channel Rtr │ │Audit Svc   │ │
│  │:3155       │ │:3152       │ │:3153       │ │:3154       │ │:3156       │ │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘ │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                               │
│  │Event Ingest│ │Bulk Upload │ │Email Ingest│                               │
│  │:3151       │ │:3158       │ │:3157       │                               │
│  └────────────┘ └────────────┘ └────────────┘                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Communication Pattern

| Direction | Target | Protocol | Description |
|---|---|---|---|
| **Outbound** | Notification Gateway :3150 | HTTPS (REST) | All API calls — CRUD, dashboard, logs, authentication |
| **Inbound** | User's browser | HTTPS | Serves SSR pages and static assets |

> **Info:** **No Direct Backend Access**
>
> The Admin UI has zero knowledge of internal microservice addresses. It communicates with a single endpoint (the Gateway). This design means the frontend can be deployed and scaled independently from all backend services, and internal service topology changes (new ports, new services) are transparent to the UI.

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
│   │   ├── layout.tsx                # Root layout — providers, sidebar, auth guard
│   │   ├── page.tsx                  # Redirect to /dashboard
│   │   ├── login/
│   │   │   └── page.tsx              # Login page (public)
│   │   ├── forgot-password/
│   │   │   └── page.tsx              # Password reset request (public)
│   │   ├── reset-password/
│   │   │   └── page.tsx              # Password reset form (public, token-gated)
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
│   │   ├── users/
│   │   │   ├── page.tsx              # User list
│   │   │   └── [id]/
│   │   │       └── page.tsx          # User detail / edit
│   │   ├── audit/
│   │   │   └── page.tsx              # Audit log viewer
│   │   └── settings/
│   │       ├── page.tsx              # System configuration
│   │       └── identity-providers/
│   │           ├── page.tsx          # SAML IdP list
│   │           └── [id]/
│   │               └── page.tsx      # IdP detail / edit
│   ├── components/
│   │   ├── ui/                       # Primitive UI components (Button, Input, Table, etc.)
│   │   ├── layout/                   # Sidebar, Header, Breadcrumbs, PageContainer
│   │   ├── auth/                     # LoginForm, SSOButton, AuthGuard, SessionProvider
│   │   ├── dashboard/                # MetricCard, VolumeChart, DeliveryRateGauge, etc.
│   │   ├── rules/                    # RuleForm, ConditionBuilder, ChannelSelector, etc.
│   │   ├── templates/                # TemplateEditor, ChannelTabPanel, VariableToolbar, etc.
│   │   ├── channels/                 # ChannelCard, ProviderConfigForm, ConnectionTestButton
│   │   ├── logs/                     # LogTable, NotificationTimeline, ContentPreview
│   │   ├── mappings/                 # MappingBuilder, FieldMappingRow, MappingTestPanel
│   │   ├── bulk-upload/              # UploadDropzone, ProgressBar, ErrorTable
│   │   ├── users/                    # UserForm, RoleSelector, ActivityLog
│   │   ├── recipient-groups/         # GroupForm, MemberList, CriteriaBuilder
│   │   └── shared/                   # Pagination, StatusBadge, ConfirmDialog, EmptyState
│   ├── hooks/                        # Custom React hooks
│   │   ├── useAuth.ts                # Authentication state and actions
│   │   ├── useRBAC.ts                # Permission checks
│   │   ├── useDashboard.ts           # Dashboard data fetching
│   │   ├── useRules.ts               # Rule CRUD operations
│   │   ├── useTemplates.ts           # Template CRUD operations
│   │   ├── useChannels.ts            # Channel config operations
│   │   ├── useMappings.ts            # Event mapping operations
│   │   ├── useNotifications.ts       # Notification log queries
│   │   ├── useBulkUpload.ts          # Upload lifecycle management
│   │   ├── useUsers.ts               # User management operations
│   │   ├── useRecipientGroups.ts     # Recipient group operations
│   │   ├── useAuditLogs.ts           # Audit log queries
│   │   └── useToast.ts               # Toast notification helper
│   ├── lib/
│   │   ├── api-client.ts             # Fetch wrapper with auth interceptor
│   │   ├── auth.ts                   # Token management (storage, refresh, decode)
│   │   ├── permissions.ts            # RBAC permission constants and check utilities
│   │   ├── validators.ts             # Zod schemas for form validation
│   │   └── formatters.ts             # Date, number, and status formatting utilities
│   ├── types/
│   │   ├── api.ts                    # API response envelope types
│   │   ├── auth.ts                   # User, session, and token types
│   │   ├── rules.ts                  # Rule, condition, action types
│   │   ├── templates.ts              # Template, version, channel content types
│   │   ├── channels.ts               # Channel, provider config types
│   │   ├── mappings.ts               # Event mapping, field mapping types
│   │   ├── notifications.ts          # Notification, status log, trace types
│   │   ├── uploads.ts                # Upload, upload row types
│   │   ├── users.ts                  # Admin user, role types
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

The Admin UI implements a complete authentication flow supporting both local credentials and SAML 2.0 SSO. All authentication state is managed client-side with JWT tokens validated by the Gateway on every API call.

### 5.1 Token Storage Strategy

| Token | Storage | Lifetime | Refresh |
|---|---|---|---|
| **Access Token** | In-memory (React context) | 15 minutes | Auto-refresh via refresh token |
| **Refresh Token** | HTTP-only, Secure, SameSite=Strict cookie | 7 days | Rotation on each use |

> **Warning:** **No localStorage for Tokens**
>
> Access tokens are never stored in localStorage or sessionStorage to prevent XSS-based token theft. The access token is held in a React context variable and is lost on page refresh — the `SessionProvider` component automatically uses the refresh token cookie to obtain a new access token on mount. This design provides the best balance of security and user experience.

### 5.2 Authentication Flow

```
    ┌──────────────────────────┐
    │  1. User visits any page │
    └────────────┬─────────────┘
                 ▼
    ┌──────────────────────────┐
    │  2. AuthGuard checks     │  ◄── Wraps all authenticated routes
    │     for valid access     │
    │     token in memory      │
    └────────────┬─────────────┘
                 ▼
     ◆ Token present & valid?  ◆
                 │
        ┌────── No ──────┐              ┌────── Yes ──────┐
        ▼                │              ▼                  │
    ┌────────────┐       │     ┌────────────────┐         │
    │ 3a. Try    │       │     │ 4. Render page │         │
    │ refresh    │       │     │ with user ctx  │         │
    │ token      │       │     └────────────────┘         │
    └─────┬──────┘       │                                │
          ▼              │                                │
     ◆ Refresh OK?  ◆   │                                │
          │              │                                │
    ┌── Yes ──┐   ┌── No ──┐                             │
    ▼         │   ▼        │                              │
┌────────┐   │ ┌────────────┐                             │
│ Store  │   │ │ Redirect   │                             │
│ new    │   │ │ to /login  │                             │
│ access │   │ │            │                             │
│ token  │───┘ └────────────┘                             │
│ → step │                                                │
│ 4      │                                                │
└────────┘                                                │
```

### 5.3 Token Refresh Mechanism

The `SessionProvider` component implements proactive token refresh:

1. **On mount:** Calls `POST /api/v1/auth/refresh` using the HTTP-only refresh cookie. If successful, stores the new access token in context and schedules the next refresh.
2. **Proactive refresh:** A timer is set to refresh the token 2 minutes before expiry (at the 13-minute mark for a 15-minute token). This ensures uninterrupted user sessions.
3. **On API 401:** If any API call returns `401 Unauthorized`, the interceptor attempts a single refresh. If the refresh fails, the user is redirected to `/login` with a `sessionExpired` query parameter.
4. **Replay detection:** If the Gateway detects a replayed refresh token, all sessions for the user are invalidated. The UI shows a "Your session has been terminated for security reasons" message and redirects to login.

### 5.4 Login Page Options

```
┌───────────────────────────────────────────────┐
│                                               │
│              Notification API                 │
│                                               │
│  ┌─────────────────────────────────────────┐  │
│  │  Email                                  │  │
│  │  ┌───────────────────────────────────┐  │  │
│  │  │ user@company.com                  │  │  │
│  │  └───────────────────────────────────┘  │  │
│  │                                         │  │
│  │  Password                               │  │
│  │  ┌───────────────────────────────────┐  │  │
│  │  │ ••••••••••••                      │  │  │
│  │  └───────────────────────────────────┘  │  │
│  │                                         │  │
│  │  [ Forgot password? ]                   │  │
│  │                                         │  │
│  │  ┌───────────────────────────────────┐  │  │
│  │  │          Sign In                  │  │  │
│  │  └───────────────────────────────────┘  │  │
│  │                                         │  │
│  │  ──────────── or ────────────           │  │
│  │                                         │  │
│  │  ┌───────────────────────────────────┐  │  │
│  │  │       Sign in with SSO            │  │  │ ◄── Only shown when
│  │  └───────────────────────────────────┘  │  │     active SAML IdP
│  └─────────────────────────────────────────┘  │     is configured
│                                               │
└───────────────────────────────────────────────┘
```

> **Info:** **SSO Button Visibility**
>
> The "Sign in with SSO" button is only rendered when the Gateway's `GET /api/v1/auth/saml/status` endpoint returns at least one active SAML Identity Provider. This is a lightweight public endpoint (no auth required) called on login page mount. When multiple IdPs are configured, a dropdown selector appears above the SSO button. See [04 — Authentication & Identity §8](04-authentication-identity.md#8-frontend-integration) for the complete frontend integration specification.

---

## 6. Role-Based Access Control (RBAC) in the UI

RBAC enforcement happens at two levels: the Gateway rejects unauthorized API calls (server-side), and the UI hides or disables elements the user cannot interact with (client-side). Client-side enforcement is a UX optimization — the Gateway remains the security boundary.

### 6.1 Permission Check Utility

The `useRBAC` hook exposes permission-checking functions derived from the JWT claims:

```
useRBAC() → {
  role: string                          // "super_admin" | "admin" | "operator" | "viewer"
  can(resource, action): boolean        // Check single permission
  canAny(checks[]): boolean             // At least one permission matches
  canAll(checks[]): boolean             // All permissions match
  isAtLeast(role): boolean              // Role hierarchy check
}
```

### 6.2 UI Visibility Matrix

| UI Element | Super Admin | Admin | Operator | Viewer |
|---|---|---|---|---|
| Dashboard | Full | Full | Full | Full |
| Rules — List | Full | Full | Full | Read-only |
| Rules — Create / Edit | Yes | Yes | Yes | Hidden |
| Rules — Delete / Toggle | Yes | Yes | Hidden | Hidden |
| Templates — List / Preview | Full | Full | Full | Read-only |
| Templates — Create / Edit | Yes | Yes | Yes | Hidden |
| Templates — Delete / Rollback | Yes | Yes | Hidden | Hidden |
| Channels — View status | Full | Full | Full | Full |
| Channels — Update config | Yes | Yes | Hidden | Hidden |
| Event Mappings — List | Full | Full | Full | Read-only |
| Event Mappings — Create / Edit / Test | Yes | Yes | Yes | Hidden |
| Event Mappings — Delete | Yes | Yes | Hidden | Hidden |
| Notification Logs | Full | Full | Full | Full |
| Bulk Upload — Upload / Retry | Yes | Yes | Yes | Hidden |
| Bulk Upload — Cancel / Delete | Yes | Yes | Hidden | Hidden |
| Recipient Groups — List | Full | Full | Full | Read-only |
| Recipient Groups — Create / Edit | Yes | Yes | Yes | Hidden |
| Recipient Groups — Delete | Yes | Yes | Hidden | Hidden |
| User Management | Full | Full (not Super Admins) | Hidden | Hidden |
| Audit Logs | Full | Full | Full | Full |
| System Configuration | Full | Hidden | Hidden | Hidden |
| Identity Provider Settings | Full | Hidden | Hidden | Hidden |
| API Key Management | Yes | Yes | Hidden | Hidden |

### 6.3 Client-Side Enforcement Pattern

```
    ┌──────────────────────────┐
    │  1. Component renders    │
    └────────────┬─────────────┘
                 ▼
    ┌──────────────────────────┐
    │  2. Call useRBAC()       │  ◄── Reads role from AuthContext (JWT claims)
    │     to get permissions   │
    └────────────┬─────────────┘
                 ▼
     ◆ can(resource, action)?  ◆
                 │
        ┌────── No ──────┐         ┌────── Yes ──────┐
        ▼                │         ▼                  │
    ┌────────────┐       │    ┌────────────────────┐  │
    │ 3a. Hide   │       │    │ 3b. Render element │  │
    │ element or │       │    │ (button, form,     │  │
    │ render as  │       │    │  menu item, etc.)  │  │
    │ disabled   │       │    └────────────────────┘  │
    └────────────┘       │                            │
                         │                            │
                         └────────────────────────────┘

    Note: If a user bypasses the UI (e.g., browser devtools) and
    calls a restricted API endpoint, the Gateway returns 403 Forbidden.
```

---

## 7. Data Fetching & State Management

### 7.1 SWR (stale-while-revalidate) Strategy

All read operations use SWR hooks for efficient data fetching with built-in caching, background revalidation, and error retry.

| Feature | Configuration |
|---|---|
| **Cache provider** | In-memory (default SWR cache) |
| **Revalidate on focus** | Enabled — refetches when user returns to tab |
| **Revalidate on reconnect** | Enabled — refetches after network recovery |
| **Deduplication interval** | 2 seconds — prevents duplicate requests within window |
| **Error retry** | 3 attempts with exponential backoff (1s, 3s, 5s) |
| **Polling intervals** | Configurable per resource (dashboard: 30s, bulk upload status: 5s) |

### 7.2 Data Flow Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      React Components                         │
│                                                               │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                 │
│  │ Page     │   │ Page     │   │ Page     │                 │
│  │ Component│   │ Component│   │ Component│                 │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘                 │
│       │              │              │                        │
│       ▼              ▼              ▼                        │
│  ┌──────────────────────────────────────────────────┐       │
│  │              Custom SWR Hooks                      │       │
│  │  useRules() · useTemplates() · useDashboard()     │       │
│  │  useChannels() · useMappings() · useNotifications()│       │
│  └──────────────────────┬───────────────────────────┘       │
│                         │                                    │
│                         ▼                                    │
│  ┌──────────────────────────────────────────────────┐       │
│  │                 SWR Cache Layer                     │       │
│  │  In-memory cache · Deduplication · Revalidation    │       │
│  └──────────────────────┬───────────────────────────┘       │
│                         │                                    │
│                         ▼                                    │
│  ┌──────────────────────────────────────────────────┐       │
│  │              API Client (fetch wrapper)             │       │
│  │  Base URL · Auth headers · Error handling          │       │
│  │  Token refresh interceptor · Response parsing      │       │
│  └──────────────────────┬───────────────────────────┘       │
└─────────────────────────┼────────────────────────────────────┘
                          │ HTTPS
                          ▼
              Notification Gateway :3150
```

### 7.3 Mutation Pattern

Write operations (create, update, delete) use a consistent mutation pattern:

1. **Optimistic update** (optional): Update the SWR cache immediately for responsive UX.
2. **API call**: Send the mutation request to the Gateway.
3. **Revalidation**: On success, mutate the SWR cache to trigger revalidation of affected keys.
4. **Rollback**: On failure, revert the optimistic update and show an error toast.

### 7.4 Server Components vs. Client Components

| Component Type | Used For | Data Fetching |
|---|---|---|
| **Server Components** | Page shells, layout, metadata, initial data prefetch | `fetch()` with `cookies()` for auth during SSR |
| **Client Components** | Interactive elements (forms, charts, editors, modals) | SWR hooks for client-side fetching and revalidation |

> **Info:** **SSR Data Prefetch**
>
> Server components in the Next.js App Router fetch initial data during SSR through the Gateway using the refresh token cookie. This data is serialized into the page HTML as a SWR `fallback`, allowing the client-side SWR hooks to hydrate instantly without a loading state on first paint. Subsequent interactions use client-side SWR for real-time updates.

---

## 8. Page Specifications

### 8.1 Dashboard (`/dashboard`)

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
│  │                                    │  │  Email    [SendGrid]   │  │
│  │  Email    █████████░ 98%           │  │  ● Healthy             │  │
│  │  SMS      ████████░░ 95%           │  │                        │  │
│  │  WhatsApp ████████░░ 97%           │  │  SMS      [Twilio]     │  │
│  │  Push     ███████░░░ 92%           │  │  ● Healthy             │  │
│  │                                    │  │                        │  │
│  └────────────────────────────────────┘  │  WhatsApp [Twilio]     │  │
│                                          │  ● Healthy             │  │
│  ┌────────────────────────────────────┐  │                        │  │
│  │  Top Triggered Rules (7 days)      │  │  Push     [FCM]        │  │
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

| Widget | Gateway Endpoint | Refresh |
|---|---|---|
| Metric cards | `GET /api/v1/dashboard/stats?period={period}` | 30s polling |
| Notification volume chart | `GET /api/v1/dashboard/stats?period={period}` | 30s polling |
| Channel breakdown | `GET /api/v1/dashboard/stats?period={period}` | 30s polling |
| Delivery rates by channel | `GET /api/v1/dashboard/stats?period={period}` | 30s polling |
| Channel health | `GET /api/v1/channels` | 60s polling |
| Top triggered rules | `GET /api/v1/dashboard/stats?period=7d` | 60s polling |
| Recent failures | `GET /api/v1/dashboard/stats?period=today` | 30s polling |

#### Graceful Degradation

When the Admin Service reports a degraded dashboard response (`meta.degraded: true`), the UI renders available widgets normally and replaces unavailable sections with a warning banner:

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠  Some metrics are temporarily unavailable.                │
│     Affected: Channel health (channel-router-service)        │
│     Last updated: 10:28 AM                                   │
└──────────────────────────────────────────────────────────────┘
```

---

### 8.2 Notification Rule Management (`/rules`)

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

When saving a rule, the Admin Service validates against multiple downstream services. If any check fails, the UI displays specific, actionable error messages:

```
┌──────────────────────────────────────────────────────────────┐
│  ✗ Rule validation failed:                                    │
│    • Event type 'order.archived' has no active mapping        │
│    • Template 'tpl-abc123' is inactive                        │
│    • Channel 'whatsapp' is not configured                     │
└──────────────────────────────────────────────────────────────┘
```

---

### 8.3 Template Editor (`/templates`)

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

### 8.4 Channel Configuration (`/channels`)

#### Channel Cards Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Notification Channels                                               │
│                                                                      │
│  ┌────────────────────┐  ┌────────────────────┐                     │
│  │  Email              │  │  SMS                │                     │
│  │  Provider: SendGrid │  │  Provider: Twilio   │                     │
│  │  ● Healthy          │  │  ● Healthy          │                     │
│  │  Rate: 98.2%        │  │  Rate: 95.1%        │                     │
│  │  Sent (24h): 845    │  │  Sent (24h): 234    │                     │
│  │  [Configure]        │  │  [Configure]        │                     │
│  └────────────────────┘  └────────────────────┘                     │
│                                                                      │
│  ┌────────────────────┐  ┌────────────────────┐                     │
│  │  WhatsApp           │  │  Push               │                     │
│  │  Provider: Twilio   │  │  Provider: FCM      │                     │
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
| **Provider** | Provider type selector (e.g., SendGrid, Mailgun for email) |
| **Credentials** | API key (masked input with reveal toggle), auth token, webhook secret |
| **Sender Identity** | From email, from name, reply-to (email); sender ID (SMS); business number (WhatsApp) |
| **Advanced** | Retry settings, rate limit overrides, custom headers |
| **Actions** | Test connection (dry-run), Save, Reset to saved values |

---

### 8.5 Notification Logs (`/logs`)

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
│  │  10:30:01.234  ● DELIVERING     Dispatched to SendGrid         │ │
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
│  │  1        SendGrid   Delivered   340ms      sg-msg-abc123       │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 8.6 Event Mappings (`/event-mappings`)

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

### 8.7 Bulk Upload (`/bulk-upload`)

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

When an upload is processing, the UI polls `GET /api/v1/bulk-upload/uploads/:id` every 5 seconds:

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

### 8.8 User Management (`/users`)

Restricted to Super Admin and Admin roles.

| Feature | Description |
|---|---|
| **List** | Name, Email, Role (badge), Status (active/locked/deactivated), Last Login, Actions |
| **Create** | Full name, email, role selector, temporary password |
| **Edit** | Update name, role, deactivate/reactivate |
| **Password reset** | Admin-triggered password reset (sends email, invalidates sessions) |
| **Activity log** | Per-user activity timeline from audit logs |
| **Protection** | Admin users cannot modify Super Admin accounts (unless they are Super Admin) |

---

### 8.9 Recipient Groups (`/recipient-groups`)

| Feature | Description |
|---|---|
| **List** | Group name, Type (static/dynamic), Member count, Status, Created At |
| **Create static** | Name, description, add members (email, customerId, name) individually or via CSV paste |
| **Create dynamic** | Name, description, criteria builder (JSON or visual) |
| **Detail** | View members with pagination, add/remove members (static only), view rules using this group |
| **Delete** | Soft-delete with confirmation; warns if group is referenced by active rules |

---

### 8.10 Audit Log Viewer (`/audit`)

| Feature | Description |
|---|---|
| **Columns** | Timestamp, User, Action, Resource Type, Resource ID, IP Address |
| **Filters** | Date range, Action type, User, Resource type |
| **Expandable rows** | Show previous/new value diff for update operations |
| **Export** | CSV export of filtered results |

---

### 8.11 System Configuration (`/settings`)

Super Admin only.

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

### 8.12 Identity Provider Settings (`/settings/identity-providers`)

Super Admin only. See [04 — Authentication & Identity §8.2](04-authentication-identity.md#82-identity-provider-settings-page) for the detailed specification.

| Feature | Description |
|---|---|
| **IdP list** | Name, Entity ID, Status (active/inactive), Users linked, Certificate expiry |
| **Add IdP** | Metadata XML upload (drag-and-drop or paste), name, auto-provision toggle, default role, attribute mapping |
| **IdP detail** | Parsed metadata, SP metadata download, test connection, certificate expiry warning |
| **Certificate warnings** | Banner at 30/14/7 days before IdP certificate expiry |

---

## 9. Component Architecture

### 9.1 Component Hierarchy

```
<RootLayout>
  <SessionProvider>                    ← Token management, auto-refresh
    <AuthGuard>                        ← Redirects to /login if unauthenticated
      <RBACProvider>                   ← Provides useRBAC() context
        <SidebarLayout>                ← Sidebar navigation + header
          <Breadcrumbs />
          <PageContent>                ← Route-specific page component
            <DataTable />              ← Reusable sortable, filterable table
            <FormDialog />             ← Modal forms for create/edit
            <ConfirmDialog />          ← Destructive action confirmation
            <Toast />                  ← Success/error notifications
          </PageContent>
        </SidebarLayout>
      </RBACProvider>
    </AuthGuard>
  </SessionProvider>
</RootLayout>
```

### 9.2 Shared Component Library

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

## 10. API Integration Layer

### 10.1 API Client

The `apiClient` is a thin `fetch` wrapper that provides:

1. **Base URL prefixing**: All requests are prefixed with `NEXT_PUBLIC_GATEWAY_URL` (default: `http://localhost:3150/api/v1`).
2. **Authentication headers**: Automatically attaches `Authorization: Bearer {accessToken}` from the auth context.
3. **Response parsing**: Unwraps the Gateway's standard response envelope (`{ data, meta, errors }`).
4. **Error handling**: Throws typed errors (`ApiError`) with status code, message, and field-level details.
5. **Token refresh interceptor**: On `401`, attempts a token refresh before retrying the original request (once).

### 10.2 Gateway Endpoint Map

The Admin UI consumes the following Gateway API endpoints, organized by feature area:

#### Authentication

| Method | Endpoint | UI Feature |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Login form submission |
| `POST` | `/api/v1/auth/refresh` | Automatic token refresh |
| `POST` | `/api/v1/auth/logout` | Logout action |
| `POST` | `/api/v1/auth/forgot-password` | Password reset request |
| `POST` | `/api/v1/auth/reset-password` | Password reset form submission |
| `GET` | `/api/v1/auth/saml/status` | SSO button visibility check |
| `GET` | `/api/v1/auth/saml/login` | SSO redirect initiation |

#### Dashboard

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/dashboard/stats?period={period}` | Dashboard metrics and charts |

#### Notification Rules

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/rules` | Rule list with filters |
| `GET` | `/api/v1/rules/:id` | Rule detail / edit form |
| `POST` | `/api/v1/rules` | Create rule |
| `PUT` | `/api/v1/rules/:id` | Update rule |
| `DELETE` | `/api/v1/rules/:id` | Delete (deactivate) rule |

#### Templates

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/templates` | Template list |
| `GET` | `/api/v1/templates/:id` | Template editor with versions |
| `POST` | `/api/v1/templates` | Create template |
| `PUT` | `/api/v1/templates/:id` | Update template (new version) |
| `DELETE` | `/api/v1/templates/:id` | Soft-delete template |
| `POST` | `/api/v1/templates/:id/preview` | Live preview with sample data |
| `PUT` | `/api/v1/templates/:id/rollback` | Rollback to previous version |

#### Channels

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/channels` | Channel list with health |
| `GET` | `/api/v1/channels/:id` | Channel configuration detail |
| `PUT` | `/api/v1/channels/:id/config` | Update channel configuration |

#### Event Mappings

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/event-mappings` | Mapping list |
| `GET` | `/api/v1/event-mappings/:id` | Mapping editor |
| `POST` | `/api/v1/event-mappings` | Create mapping |
| `PUT` | `/api/v1/event-mappings/:id` | Update mapping |
| `DELETE` | `/api/v1/event-mappings/:id` | Delete mapping |
| `POST` | `/api/v1/event-mappings/:id/test` | Test mapping with sample payload |

#### Notifications & Tracing

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/notifications` | Notification log list |
| `GET` | `/api/v1/notifications/:id` | Notification detail |
| `GET` | `/api/v1/notifications/:id/trace` | Full lifecycle trace |
| `POST` | `/api/v1/notifications/send` | Manual notification send |

#### Bulk Upload

| Method | Endpoint | UI Feature |
|---|---|---|
| `POST` | `/api/v1/bulk-upload/uploads` | File upload (`multipart/form-data`) |
| `GET` | `/api/v1/bulk-upload/uploads` | Upload history list |
| `GET` | `/api/v1/bulk-upload/uploads/:id` | Upload status / progress |
| `GET` | `/api/v1/bulk-upload/uploads/:id/errors` | Failed row details |
| `POST` | `/api/v1/bulk-upload/uploads/:id/retry` | Retry failed rows |
| `DELETE` | `/api/v1/bulk-upload/uploads/:id` | Cancel / delete upload |

#### User Management

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/users` | User list |
| `GET` | `/api/v1/users/:id` | User detail |
| `POST` | `/api/v1/users` | Create user |
| `PUT` | `/api/v1/users/:id` | Update user |
| `POST` | `/api/v1/users/:id/reset-password` | Admin-triggered password reset |

#### Recipient Groups

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

#### Audit Logs

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/audit/logs` | Audit log viewer |

#### System Configuration

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/system-configs` | System settings page |
| `PUT` | `/api/v1/system-configs/:key` | Update configuration value |

#### SAML Identity Providers

| Method | Endpoint | UI Feature |
|---|---|---|
| `GET` | `/api/v1/saml/idp` | IdP list |
| `POST` | `/api/v1/saml/idp` | Register new IdP |
| `PUT` | `/api/v1/saml/idp/:id` | Update IdP |
| `DELETE` | `/api/v1/saml/idp/:id` | Deactivate IdP |
| `GET` | `/api/v1/auth/saml/metadata` | Download SP metadata |

---

## 11. Routing & Navigation

### 11.1 Route Structure

| Route | Page | Auth | Min Role |
|---|---|---|---|
| `/login` | Login | Public | — |
| `/forgot-password` | Password reset request | Public | — |
| `/reset-password` | Password reset form | Public (token-gated) | — |
| `/dashboard` | Dashboard | Required | Viewer |
| `/rules` | Rule list | Required | Viewer |
| `/rules/new` | Create rule | Required | Operator |
| `/rules/:id` | Rule detail / edit | Required | Viewer (view) / Operator (edit) |
| `/templates` | Template list | Required | Viewer |
| `/templates/new` | Create template | Required | Operator |
| `/templates/:id` | Template editor | Required | Viewer (view) / Operator (edit) |
| `/channels` | Channel list | Required | Viewer |
| `/channels/:id` | Channel configuration | Required | Admin |
| `/logs` | Notification log list | Required | Viewer |
| `/logs/:id` | Notification detail / trace | Required | Viewer |
| `/event-mappings` | Mapping list | Required | Viewer |
| `/event-mappings/new` | Create mapping | Required | Operator |
| `/event-mappings/:id` | Mapping editor / test | Required | Viewer (view) / Operator (edit) |
| `/bulk-upload` | Upload zone + history | Required | Viewer (view) / Operator (upload) |
| `/bulk-upload/:id` | Upload detail | Required | Viewer |
| `/recipient-groups` | Group list | Required | Viewer |
| `/recipient-groups/new` | Create group | Required | Operator |
| `/recipient-groups/:id` | Group detail | Required | Viewer (view) / Operator (edit) |
| `/users` | User management | Required | Admin |
| `/users/:id` | User detail / edit | Required | Admin |
| `/audit` | Audit log viewer | Required | Viewer |
| `/settings` | System configuration | Required | Super Admin |
| `/settings/identity-providers` | SAML IdP management | Required | Super Admin |
| `/settings/identity-providers/:id` | IdP detail | Required | Super Admin |

### 11.2 Sidebar Navigation

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
│  ADMINISTRATION ────────┤ ← Visible to Admin+ only
│  ├─ Users                │
│  └─ Settings             │ ← Super Admin only
│     └─ Identity Providers│ ← Super Admin only
│                          │
│  ─────────────────────── │
│  Jane Smith              │
│  Operator                │
│  [ Logout ]              │
└─────────────────────────┘
```

The sidebar sections are conditionally rendered based on the user's role:
- **MANAGEMENT** and **OPERATIONS**: Visible to all roles (with read-only access for Viewer)
- **ADMINISTRATION**: Visible to Admin and Super Admin only
- **Settings / Identity Providers**: Visible to Super Admin only

---

## 12. Flowcharts

### 12.1 Rule Creation Flow (End-to-End)

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
    │  5. POST /api/v1/rules   │  ◄── API call via apiClient
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

### 12.2 Template Save & Version Flow

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
    │  3. PUT /api/v1/         │
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

### 12.3 Bulk Upload Processing Flow

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
    │  3. POST /api/v1/        │  ◄── multipart/form-data
    │     bulk-upload/uploads  │
    └────────────┬─────────────┘
                 ▼
    ┌─────────────────────────┐
    │  4. Receive 202 Accepted │  ◄── { uploadId, status: "validating" }
    │     + uploadId           │
    └────────────┬─────────────┘
                 ▼
    ┌─────────────────────────┐
    │  5. Start polling:       │  ◄── GET /api/v1/bulk-upload/
    │     every 5 seconds      │      uploads/:id
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

### 12.4 Mapping Test Flow

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
    │  4. POST /api/v1/        │
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

## 13. Sequence Diagrams

### 13.1 Login Flow (Local Authentication)

```
Browser              Admin UI (Next.js)     Gateway :3150     Admin Service :3155
   │                      │                      │                      │
   │  Submit login form   │                      │                      │
   │  (email, password)   │                      │                      │
   │─────────────────────▶│                      │                      │
   │                      │                      │                      │
   │                      │  POST /api/v1/       │                      │
   │                      │  auth/login          │                      │
   │                      │  { email, pwd }      │                      │
   │                      │─────────────────────▶│                      │
   │                      │                      │  Forward to Admin    │
   │                      │                      │  Service (no auth    │
   │                      │                      │  check — login is    │
   │                      │                      │  public endpoint)    │
   │                      │                      │─────────────────────▶│
   │                      │                      │                      │
   │                      │                      │  Validate credentials│
   │                      │                      │  (bcrypt compare)    │
   │                      │                      │                      │
   │                      │                      │  200 OK              │
   │                      │                      │  { accessToken,      │
   │                      │                      │    user: {...} }     │
   │                      │                      │  Set-Cookie:         │
   │                      │                      │  refreshToken=...    │
   │                      │                      │◄─────────────────────│
   │                      │  200 OK              │                      │
   │                      │  + Set-Cookie        │                      │
   │                      │◄─────────────────────│                      │
   │                      │                      │                      │
   │                      │  Store accessToken   │                      │
   │                      │  in React context    │                      │
   │                      │  (in-memory)         │                      │
   │                      │                      │                      │
   │  Redirect to         │                      │                      │
   │  /dashboard          │                      │                      │
   │◄─────────────────────│                      │                      │
```

### 13.2 SSO Login Flow (SAML 2.0)

```
Browser              Admin UI             Gateway :3150      Azure AD (IdP)
   │                      │                      │                │
   │  Click "SSO" button  │                      │                │
   │─────────────────────▶│                      │                │
   │                      │                      │                │
   │  window.location =   │                      │                │
   │  /api/v1/auth/saml/  │                      │                │
   │  login               │                      │                │
   │────────────────────────────────────────────▶│                │
   │                      │                      │                │
   │                      │  302 Redirect to     │                │
   │                      │  Azure AD SSO URL    │                │
   │                      │  (with AuthnRequest) │                │
   │◄────────────────────────────────────────────│                │
   │                      │                      │                │
   │  Follow redirect to Azure AD login page     │                │
   │────────────────────────────────────────────────────────────▶│
   │                      │                      │                │
   │                      │                      │  User logs in  │
   │                      │                      │  at Azure AD   │
   │                      │                      │                │
   │  SAML Response (POST to ACS endpoint)       │                │
   │◄────────────────────────────────────────────────────────────│
   │                      │                      │                │
   │  POST /api/v1/auth/  │                      │                │
   │  saml/acs            │                      │                │
   │  (SAMLResponse)      │                      │                │
   │────────────────────────────────────────────▶│                │
   │                      │                      │                │
   │                      │  Validate assertion  │                │
   │                      │  Link/create user    │                │
   │                      │  Issue JWT tokens    │                │
   │                      │                      │                │
   │  302 Redirect to     │                      │                │
   │  /dashboard          │                      │                │
   │  + Set-Cookie:       │                      │                │
   │  accessToken (query) │                      │                │
   │  refreshToken (cookie)                      │                │
   │◄────────────────────────────────────────────│                │
   │                      │                      │                │
   │  Load /dashboard     │                      │                │
   │─────────────────────▶│                      │                │
   │                      │  Extract accessToken │                │
   │                      │  from URL, store in  │                │
   │                      │  React context       │                │
```

### 13.3 Dashboard Data Loading (with SSR Prefetch)

```
Browser              Next.js Server         Gateway :3150     Admin Service :3155
   │                      │                      │                      │
   │  GET /dashboard      │                      │                      │
   │─────────────────────▶│                      │                      │
   │                      │                      │                      │
   │                      │  [Server Component]  │                      │
   │                      │  Read refreshToken   │                      │
   │                      │  from cookie         │                      │
   │                      │                      │                      │
   │                      │  POST /api/v1/       │                      │
   │                      │  auth/refresh        │                      │
   │                      │  (Cookie: refresh)   │                      │
   │                      │─────────────────────▶│                      │
   │                      │  { accessToken }     │                      │
   │                      │◄─────────────────────│                      │
   │                      │                      │                      │
   │                      │  GET /api/v1/        │                      │
   │                      │  dashboard/stats     │                      │
   │                      │  Authorization:      │                      │
   │                      │  Bearer {token}      │                      │
   │                      │─────────────────────▶│                      │
   │                      │                      │  Proxy to Admin      │
   │                      │                      │  Service (parallel   │
   │                      │                      │  fan-out)            │
   │                      │                      │─────────────────────▶│
   │                      │                      │  Dashboard data      │
   │                      │                      │◄─────────────────────│
   │                      │  200 OK { data }     │                      │
   │                      │◄─────────────────────│                      │
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

### 13.4 Template Preview (Live)

```
Browser              Admin UI             Gateway :3150      Template Service :3153
   │                      │                      │                      │
   │  Type in editor      │                      │                      │
   │  (debounced 500ms)   │                      │                      │
   │─────────────────────▶│                      │                      │
   │                      │                      │                      │
   │                      │  POST /api/v1/       │                      │
   │                      │  templates/:id/      │                      │
   │                      │  preview             │                      │
   │                      │  { sampleData }      │                      │
   │                      │─────────────────────▶│                      │
   │                      │                      │  Proxy to Admin Svc  │
   │                      │                      │  → Template Svc      │
   │                      │                      │─────────────────────▶│
   │                      │                      │                      │
   │                      │                      │  Render Handlebars   │
   │                      │                      │  with sample data    │
   │                      │                      │                      │
   │                      │                      │  200 OK              │
   │                      │                      │  { renderedHtml,     │
   │                      │                      │    renderedSms,      │
   │                      │                      │    renderedPush }    │
   │                      │                      │◄─────────────────────│
   │                      │  200 OK              │                      │
   │                      │◄─────────────────────│                      │
   │                      │                      │                      │
   │  Update preview      │                      │                      │
   │  panel with rendered │                      │                      │
   │  content             │                      │                      │
   │◄─────────────────────│                      │                      │
```

### 13.5 Token Refresh with 401 Recovery

```
Browser              Admin UI             Gateway :3150
   │                      │                      │
   │  Click "Save Rule"   │                      │
   │─────────────────────▶│                      │
   │                      │                      │
   │                      │  PUT /api/v1/        │
   │                      │  rules/:id           │
   │                      │  Authorization:      │
   │                      │  Bearer {expired}    │
   │                      │─────────────────────▶│
   │                      │                      │
   │                      │  401 Unauthorized    │
   │                      │  (token expired)     │
   │                      │◄─────────────────────│
   │                      │                      │
   │                      │  [Interceptor]       │
   │                      │  POST /api/v1/       │
   │                      │  auth/refresh        │
   │                      │  (Cookie: refresh)   │
   │                      │─────────────────────▶│
   │                      │                      │
   │                      │  200 OK              │
   │                      │  { accessToken }     │
   │                      │  Set-Cookie: refresh │
   │                      │◄─────────────────────│
   │                      │                      │
   │                      │  [Retry original]    │
   │                      │  PUT /api/v1/        │
   │                      │  rules/:id           │
   │                      │  Authorization:      │
   │                      │  Bearer {new token}  │
   │                      │─────────────────────▶│
   │                      │                      │
   │                      │  200 OK              │
   │                      │◄─────────────────────│
   │                      │                      │
   │  "Rule saved"        │                      │
   │  toast shown         │                      │
   │◄─────────────────────│                      │
```

---

## 14. Entity Relationship: UI Data Model

The Admin UI does not have its own database, but it operates on a well-defined data model derived from the API responses. The following diagram shows the logical relationships between the primary entities as understood by the frontend.

```
┌──────────────────────────────┐
│          User (self)          │
├──────────────────────────────┤
│  id               UUID       │
│  email            string     │
│  fullName         string     │
│  role             Role       │
│  permissions      string[]   │
│  isActive         boolean    │
│  lastLoginAt      datetime   │
└──────────┬───────────────────┘
           │ manages
           ▼
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

## 15. Error Handling & User Feedback

### 15.1 Error Categories

| Error Type | HTTP Status | UI Behavior |
|---|---|---|
| **Validation error** | 400 | Highlight specific form fields with error messages |
| **Authentication failure** | 401 | Redirect to login (with auto-refresh attempt first) |
| **Forbidden** | 403 | Show "insufficient permissions" message; do not show restricted UI elements |
| **Not found** | 404 | Show "resource not found" empty state with back navigation |
| **Conflict** | 409 | Show specific conflict message (e.g., "Email already in use") |
| **Rate limited** | 429 | Show "Too many requests, please try again in X seconds" |
| **Server error** | 500 | Show generic error message with retry option |
| **Gateway timeout** | 504 | Show "Service temporarily unavailable" with retry |
| **Network error** | — | Show offline banner with automatic reconnection detection |

### 15.2 Toast Notifications

| Type | Duration | Use Case |
|---|---|---|
| **Success** | 3 seconds (auto-dismiss) | Resource created, updated, deleted |
| **Error** | Persistent (manual dismiss) | API errors, validation failures |
| **Warning** | 5 seconds | Degraded dashboard data, certificate expiry |
| **Info** | 4 seconds | Background operation completed (e.g., bulk upload done) |

### 15.3 Form Validation Pattern

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

## 16. Accessibility & Responsive Design

### 16.1 Accessibility Standards

| Standard | Implementation |
|---|---|
| **WCAG 2.1 AA** | Target compliance level |
| **Keyboard navigation** | All interactive elements reachable via Tab; Enter/Space to activate; Escape to close modals |
| **Screen readers** | Semantic HTML, ARIA labels, ARIA live regions for dynamic content (toasts, loading states) |
| **Color contrast** | Minimum 4.5:1 ratio for normal text, 3:1 for large text (enforced via Tailwind config) |
| **Focus indicators** | Visible focus ring on all interactive elements |
| **Error announcements** | Form validation errors announced via `aria-live="polite"` |
| **Reduced motion** | Respects `prefers-reduced-motion` media query for animations |

### 16.2 Responsive Breakpoints

| Breakpoint | Width | Layout Behavior |
|---|---|---|
| **Desktop** | >= 1280px | Full sidebar + main content |
| **Tablet** | 768px - 1279px | Collapsible sidebar (hamburger menu) |
| **Mobile** | < 768px | Bottom navigation, stacked layouts, simplified tables |

> **Info:** **Primary Target: Desktop**
>
> The Admin UI is primarily designed for desktop use by the operative team. Tablet and mobile layouts are supported for monitoring and read-only access (dashboard, logs) but complex operations (template editing, mapping builder) are optimized for desktop screen sizes.

---

## 17. Testing Strategy

### 17.1 Unit Tests (Jest)

| Scope | Coverage Target | Examples |
|---|---|---|
| **Custom hooks** | 90%+ | `useAuth`, `useRBAC`, `useRules`, `useBulkUpload` |
| **Utility functions** | 95%+ | Date formatters, permission checks, validators |
| **Zod schemas** | 100% | All form validation schemas |
| **API client** | 90%+ | Error handling, token refresh, response parsing |

### 17.2 Component Tests (Jest + React Testing Library)

| Scope | Coverage Target | Examples |
|---|---|---|
| **Form components** | 85%+ | RuleForm, TemplateEditor, MappingBuilder |
| **Data display** | 80%+ | DataTable, StatusBadge, NotificationTimeline |
| **Auth components** | 90%+ | LoginForm, AuthGuard, SessionProvider |

### 17.3 End-to-End Tests (Playwright)

| Flow | Browser Targets | Description |
|---|---|---|
| Login (local) | Chromium, Firefox, WebKit | Email/password login, token storage, redirect to dashboard |
| Login (SSO) | Chromium | SAML SSO redirect and callback (mocked IdP) |
| Rule CRUD | Chromium | Create, edit, toggle, delete a notification rule |
| Template editing | Chromium, Firefox | Create template, edit content, preview, save new version |
| Bulk upload | Chromium | Upload XLSX, monitor progress, download result |
| Dashboard | Chromium | Verify all widgets render, period selector changes data |
| RBAC enforcement | Chromium | Verify Viewer cannot see edit buttons, Operator cannot see user management |

### 17.4 Test Configuration

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

## 18. Security Considerations

| Concern | Mitigation |
|---|---|
| **XSS prevention** | React's default JSX escaping; DOMPurify for any `dangerouslySetInnerHTML` (template preview only); Content-Security-Policy headers |
| **CSRF protection** | SameSite=Strict cookies for refresh tokens; no cookie-based auth for API calls (Bearer token in Authorization header) |
| **Token storage** | Access tokens in memory only (React context); refresh tokens in HTTP-only, Secure, SameSite=Strict cookies |
| **Input sanitization** | Zod validation on all form inputs before submission; server-side validation as final authority |
| **Sensitive data masking** | Channel credentials displayed as masked values (`SG.***...xYz`); passwords never shown |
| **Clickjacking** | `X-Frame-Options: DENY` and `frame-ancestors 'none'` in CSP |
| **Dependency security** | `npm audit` in CI pipeline; Dependabot for automated dependency updates |
| **Content Security Policy** | Strict CSP headers: `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline'` (Tailwind); `img-src 'self' data: https:`; `connect-src 'self' {GATEWAY_URL}` |
| **HTTPS only** | `Strict-Transport-Security: max-age=31536000; includeSubDomains` in production |

---

## 19. Monitoring & Observability

### 19.1 Client-Side Metrics

| Metric | Description | Collection Method |
|---|---|---|
| **Page load time** | Time to interactive for each page | `Performance` API + custom reporting |
| **API call latency** | Request duration per endpoint | API client interceptor |
| **API error rate** | Failed API calls by status code | API client interceptor |
| **Auth refresh count** | Token refresh frequency | Session provider tracking |
| **User actions** | CRUD operations by type and outcome | Event logging in mutation hooks |

### 19.2 Error Tracking

| Category | Approach |
|---|---|
| **Unhandled errors** | Global error boundary component captures React render errors; displays fallback UI |
| **API errors** | Centralized error handler in API client; structured logging for debugging |
| **Network failures** | Online/offline detection via `navigator.onLine` and `window` events |

### 19.3 Health Monitoring

The Admin UI reports its own health via a lightweight endpoint for container orchestration:

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Next.js API route returning `{ status: "healthy", version: "x.y.z" }` for Docker/Kubernetes liveness probes |

---

## 20. Configuration & Environment Variables

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_GATEWAY_URL` | Notification Gateway base URL | `http://localhost:3150` |
| `NEXT_PUBLIC_API_PREFIX` | API path prefix | `/api/v1` |
| `NEXT_PUBLIC_APP_NAME` | Application name in header/title | `Notification API` |
| `NEXT_PUBLIC_SSO_ENABLED` | Show SSO login button (also checked dynamically) | `true` |
| `NEXT_PUBLIC_POLLING_INTERVAL_DASHBOARD` | Dashboard metrics polling interval (ms) | `30000` |
| `NEXT_PUBLIC_POLLING_INTERVAL_UPLOAD` | Bulk upload status polling interval (ms) | `5000` |
| `NEXT_PUBLIC_TOKEN_REFRESH_BUFFER_MS` | Time before expiry to proactively refresh token (ms) | `120000` (2 min) |
| `NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB` | Maximum XLSX file size | `10` |
| `NEXT_PUBLIC_MAX_UPLOAD_ROWS` | Maximum rows per XLSX upload | `5000` |
| `NEXT_PUBLIC_DEBOUNCE_SEARCH_MS` | Search input debounce delay (ms) | `300` |
| `NEXT_PUBLIC_DEBOUNCE_PREVIEW_MS` | Template preview debounce delay (ms) | `500` |
| `NEXT_PUBLIC_DEFAULT_PAGE_SIZE` | Default pagination size | `50` |
| `PORT` | Server listening port | `3159` |
| `NODE_ENV` | Environment (`development`, `production`, `test`) | `development` |

---

## 21. Deployment

### 21.1 Docker Configuration

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

### 21.2 Docker Compose Entry

```yaml
notification-admin-ui:
  build: ./notification-admin-ui
  ports:
    - "3159:3159"
  environment:
    - NEXT_PUBLIC_GATEWAY_URL=http://notification-gateway:3150
    - NODE_ENV=production
  depends_on:
    - notification-gateway
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "http://localhost:3159/api/health"]
    interval: 30s
    timeout: 5s
    retries: 3
```

### 21.3 Build & Deployment Pipeline

| Stage | Action | Tools |
|---|---|---|
| **Lint** | ESLint + Prettier check | `npm run lint` |
| **Type Check** | TypeScript compilation | `npm run type-check` |
| **Unit Tests** | Jest with coverage threshold | `npm run test -- --coverage` |
| **E2E Tests** | Playwright against local dev server | `npm run test:e2e` |
| **Build** | Next.js production build (standalone output) | `npm run build` |
| **Docker** | Build and push container image | `docker build -t notification-admin-ui:latest .` |
| **Deploy** | Rolling update with health check | Docker Compose or Kubernetes |

### 21.4 Performance Optimization

| Technique | Description |
|---|---|
| **Standalone output** | Next.js standalone mode reduces Docker image size (~100 MB vs ~500 MB) |
| **Server Components** | Pages without interactivity rendered as server components — reduced client JS bundle |
| **Code splitting** | Per-route code splitting via App Router; heavy components (TipTap, Monaco, Recharts) lazy-loaded |
| **Image optimization** | Next.js `<Image>` component for automatic WebP conversion and lazy loading |
| **SWR caching** | Avoids redundant API calls; stale data shown instantly while revalidating in background |
| **Static assets** | Fonts, icons, and CSS served with immutable cache headers |

---

*Notification API Documentation v1.0 -- Architecture Team -- 2026*
