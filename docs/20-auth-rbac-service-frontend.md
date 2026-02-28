# 20 — Auth RBAC Service Frontend

**Notification API — Auth RBAC Service Frontend Deep-Dive**

| | |
|---|---|
| **Version:** | 1.0 |
| **Date:** | 2026-02-27 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture & Integration Points](#3-architecture--integration-points)
4. [Authentication](#4-authentication)
5. [Page Specifications](#5-page-specifications)
6. [Component Architecture](#6-component-architecture)
7. [Routing Table](#7-routing-table)
8. [API Integration](#8-api-integration)

---

## 1. Service Overview

The Auth RBAC Service Frontend is a Next.js admin interface for managing the centralized authentication and RBAC system. It provides application registration, user lifecycle management, role and permission configuration, and user-to-application assignment. This is a standalone frontend that communicates exclusively with the auth-rbac-service-backend (:3160).

| Attribute | Value |
|---|---|
| **Technology** | Next.js 14 (TypeScript, App Router) |
| **Port** | `3161` |
| **Database** | None (frontend — all data via API) |
| **API Backend** | auth-rbac-service-backend (:3160) |
| **Source Repo Folder** | `auth-rbac-service-frontend/` |

### Responsibilities

1. **Application Management:** Register, edit, activate/deactivate applications. View application details including roles, permissions, and assigned users.
2. **User Management:** Create users, edit profiles, manage status (activate, deactivate, unlock), trigger password resets.
3. **Role Management:** Create and edit roles per application, assign hierarchy levels, manage role-permission mappings.
4. **Permission Management:** Define and manage permissions per application as resource + action pairs.
5. **User-Application Assignment:** Grant/revoke user access to applications, assign/modify roles within applications.

> **Info:** **Self-Authenticating**
>
> The auth-rbac-service-frontend is itself a registered application in the auth-rbac-service-backend. Users access it by logging in through the ecommerce-backoffice (:3162) and launching the "Auth RBAC Admin" application, which redirects here with an app-scoped JWT.

---

## 2. Technology Stack

| Technology | Purpose |
|---|---|
| Next.js 14 | React framework with App Router, server components, TypeScript |
| Tailwind CSS | Utility-first CSS framework for styling |
| React Hook Form | Form state management and validation |
| Zod | Schema validation for form inputs |
| SWR | Data fetching, caching, and revalidation |
| TypeScript | Type safety across the application |

---

## 3. Architecture & Integration Points

```
┌──────────────────────────────┐
│  ecommerce-backoffice :3162  │
│  User logs in, launches app  │
└──────────────┬───────────────┘
               │ Redirect with appToken
               ▼
┌──────────────────────────────┐     ┌──────────────────────────────┐
│  auth-rbac-service-frontend  │     │  auth-rbac-service-backend   │
│  :3161                       │────►│  :3160                       │
│  Next.js Admin UI            │     │  REST API                    │
│                              │◄────│                              │
└──────────────────────────────┘     └──────────────────────────────┘
```

All API calls go through a centralized API client that:
- Attaches the app-scoped JWT as `Authorization: Bearer {token}` header
- Handles 401 responses by redirecting to ecommerce-backoffice login
- Provides consistent error handling and loading states

---

## 4. Authentication

### Token Lifecycle

1. User logs in at ecommerce-backoffice (:3162)
2. User clicks "Auth RBAC Admin" application card
3. ecommerce-backoffice requests app-scoped token from auth-rbac-service-backend
4. Redirect to auth-rbac-service-frontend with `?token={appToken}` query parameter
5. Frontend stores token in memory (not localStorage for security)
6. All API requests include `Authorization: Bearer {token}` header
7. Before expiry (at ~12 minutes of 15-minute lifetime), proactively refresh via `GET /auth/app-token/refresh`
8. On 401 response, redirect to ecommerce-backoffice login page

---

## 5. Page Specifications

### 5.1 Login / Token Receipt Page

**Route:** `/` (root)

- Receives `?token={appToken}` query parameter from ecommerce-backoffice redirect
- Validates token (decode, check expiry)
- Stores token in memory
- Redirects to `/applications` (default landing page)
- If no token or invalid token: redirects to ecommerce-backoffice login

### 5.2 Application List Page

**Route:** `/applications`

```
┌─────────────────────────────────────────────────────────┐
│  Applications                          [+ New Application]│
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐│
│  │ Search: [________________________]  Status: [All ▼] ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌──────────────┬──────────┬──────┬───────┬──────────┐ │
│  │ Name         │ Code     │Users │ Roles │ Status   │ │
│  ├──────────────┼──────────┼──────┼───────┼──────────┤ │
│  │ Notification │ notif-api│  12  │   4   │ Active   │ │
│  │ Auth RBAC    │ auth-rbac│   3  │   4   │ Active   │ │
│  │ Inventory    │ inv-mgmt │   8  │   3   │ Inactive │ │
│  └──────────────┴──────────┴──────┴───────┴──────────┘ │
│                                                         │
│  Showing 1-3 of 3                    [< 1 >]           │
└─────────────────────────────────────────────────────────┘
```

- Fetches: `GET /applications`
- Actions: Click row → navigate to `/applications/:id`, click "+ New Application" → navigate to `/applications/new`

### 5.3 Application Create Page

**Route:** `/applications/new`

- Form fields: Name, Code (auto-generated from name, editable), Description, Frontend URL
- Submit: `POST /applications`
- On success: redirect to `/applications/:id`

### 5.4 Application Detail / Edit Page

**Route:** `/applications/:id`

```
┌─────────────────────────────────────────────────────────┐
│  ← Back to Applications                                │
│                                                         │
│  Notification API                    [Edit] [Deactivate]│
│  Code: notification-api                                 │
│  Frontend URL: http://localhost:3159                    │
│  Status: Active                                         │
├─────────────────────────────────────────────────────────┤
│  [Roles]  [Permissions]  [Users]                       │
├─────────────────────────────────────────────────────────┤
│  Roles (4)                              [+ New Role]   │
│  ┌──────────────┬───────┬────────┬───────────────────┐ │
│  │ Name         │ Level │ System │ Permissions       │ │
│  ├──────────────┼───────┼────────┼───────────────────┤ │
│  │ Super Admin  │   0   │  Yes   │ 12 permissions    │ │
│  │ Admin        │  10   │  Yes   │ 10 permissions    │ │
│  │ Operator     │  20   │  Yes   │  6 permissions    │ │
│  │ Viewer       │  30   │  Yes   │  3 permissions    │ │
│  └──────────────┴───────┴────────┴───────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

- Tabs: Roles, Permissions, Users (assigned to this application)
- Edit: inline form for application details
- Deactivate: confirmation dialog
- Roles tab: CRUD roles, manage role-permission assignments
- Permissions tab: CRUD permissions
- Users tab: list users assigned to this application with their roles

### 5.5 User List Page

**Route:** `/users`

```
┌─────────────────────────────────────────────────────────┐
│  Users                                     [+ New User]│
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐│
│  │ Search: [________________________]  Status: [All ▼] ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌──────────────┬─────────────────┬──────┬────────────┐│
│  │ Name         │ Email           │ Apps │ Status     ││
│  ├──────────────┼─────────────────┼──────┼────────────┤│
│  │ John Admin   │ john@company.com│   3  │ Active     ││
│  │ Jane Ops     │ jane@company.com│   1  │ Active     ││
│  │ Bob View     │ bob@company.com │   2  │ Locked     ││
│  └──────────────┴─────────────────┴──────┴────────────┘│
│                                                         │
│  Showing 1-3 of 3                    [< 1 >]           │
└─────────────────────────────────────────────────────────┘
```

- Fetches: `GET /users`
- Actions: Click row → `/users/:id`, "+ New User" → `/users/new`

### 5.6 User Create Page

**Route:** `/users/new`

- Form fields: Email, Full Name, Temporary Password (auto-generate option)
- Submit: `POST /users`
- On success: redirect to `/users/:id`

### 5.7 User Detail / Edit Page

**Route:** `/users/:id`

```
┌─────────────────────────────────────────────────────────┐
│  ← Back to Users                                       │
│                                                         │
│  John Admin                    [Edit] [Reset Password] │
│  Email: john@company.com       [Deactivate] [Unlock]   │
│  Status: Active                                         │
│  Last Login: 2026-02-27 14:30                          │
│  Password Changed: 2026-01-15                          │
├─────────────────────────────────────────────────────────┤
│  Application Access                                     │
│  ┌──────────────┬──────────────────┬──────────────────┐│
│  │ Application  │ Roles            │ Actions          ││
│  ├──────────────┼──────────────────┼──────────────────┤│
│  │ Notification │ Admin, Operator  │ [Edit] [Remove]  ││
│  │ Auth RBAC    │ Super Admin      │ [Edit] [Remove]  ││
│  │ Inventory    │ Viewer           │ [Edit] [Remove]  ││
│  └──────────────┴──────────────────┴──────────────────┘│
│                                                         │
│  [+ Assign Application]                                │
└─────────────────────────────────────────────────────────┘
```

- Edit profile: inline form (Full Name, Status)
- Reset Password: `POST /users/:id/reset-password`
- Unlock: `PUT /users/:id` with status=ACTIVE
- Deactivate: `PUT /users/:id` with status=DEACTIVATED (confirmation dialog)
- Assign Application: modal with application dropdown → `POST /users/:id/applications`
- Edit Roles: modal with role checkboxes → `PUT /users/:id/applications/:appId/roles`
- Remove: `DELETE /users/:id/applications/:appId` (confirmation dialog)

---

## 6. Component Architecture

```
app/
  layout.tsx                    # Root layout with auth provider
  page.tsx                      # Token receipt / redirect
  applications/
    page.tsx                    # Application list
    new/
      page.tsx                  # Create application form
    [id]/
      page.tsx                  # Application detail with tabs
  users/
    page.tsx                    # User list
    new/
      page.tsx                  # Create user form
    [id]/
      page.tsx                  # User detail with app assignments

components/
  layout/
    sidebar.tsx                 # Navigation sidebar
    header.tsx                  # Top header with user info
  applications/
    application-table.tsx       # Application list table
    application-form.tsx        # Create/edit application form
    role-tab.tsx                # Roles tab content
    permission-tab.tsx          # Permissions tab content
    users-tab.tsx               # Users tab content
  users/
    user-table.tsx              # User list table
    user-form.tsx               # Create/edit user form
    app-assignment-modal.tsx    # Assign application modal
    role-assignment-modal.tsx   # Assign roles modal
  common/
    data-table.tsx              # Reusable sortable table
    pagination.tsx              # Pagination controls
    search-filter.tsx           # Search input with filters
    confirm-dialog.tsx          # Confirmation dialog
    status-badge.tsx            # Status indicator badge

lib/
  api-client.ts                 # Centralized API client with auth
  auth-provider.tsx             # React context for token management
  types.ts                      # TypeScript interfaces
```

---

## 7. Routing Table

| Route | Page | Access |
|-------|------|--------|
| `/` | Token receipt / redirect | Public (receives token from redirect) |
| `/applications` | Application list | Super Admin, Admin |
| `/applications/new` | Create application | Super Admin |
| `/applications/:id` | Application detail / edit | Super Admin, Admin |
| `/users` | User list | Super Admin, Admin |
| `/users/new` | Create user | Super Admin, Admin |
| `/users/:id` | User detail / edit | Super Admin, Admin |

---

## 8. API Integration

### Endpoint Mapping

| UI Action | API Endpoint |
|-----------|-------------|
| List applications | `GET /applications` |
| Create application | `POST /applications` |
| Get application | `GET /applications/:id` |
| Update application | `PUT /applications/:id` |
| Deactivate application | `DELETE /applications/:id` |
| List roles | `GET /applications/:id/roles` |
| Create role | `POST /applications/:id/roles` |
| Update role | `PUT /applications/:id/roles/:roleId` |
| Delete role | `DELETE /applications/:id/roles/:roleId` |
| List permissions | `GET /applications/:id/permissions` |
| Create permission | `POST /applications/:id/permissions` |
| Delete permission | `DELETE /applications/:id/permissions/:permissionId` |
| Assign permissions to role | `PUT /applications/:id/roles/:roleId/permissions` |
| List users | `GET /users` |
| Create user | `POST /users` |
| Get user | `GET /users/:id` |
| Update user | `PUT /users/:id` |
| Reset password | `POST /users/:id/reset-password` |
| List user apps | `GET /users/:id/applications` |
| Assign app | `POST /users/:id/applications` |
| Revoke app | `DELETE /users/:id/applications/:appId` |
| Assign roles | `PUT /users/:id/applications/:appId/roles` |

---

*Notification API — Auth RBAC Service Frontend v1.0 — Architecture Team — 2026*
